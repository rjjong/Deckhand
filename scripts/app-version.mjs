import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

function parts(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) {
    throw new Error('App version must use Major.Minor.Build, for example 2.0.0.');
  }
  const numbers = value.split('.').map(Number);
  if (!numbers.every(Number.isSafeInteger)) throw new Error('App version number is too large.');
  return numbers;
}

async function readState(root) {
  const state = JSON.parse(await readFile(resolve(root, 'version.json'), 'utf8'));
  parts(state.version);
  if (state.lastBuiltVersion != null) parts(state.lastBuiltVersion);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(state.date || '')) throw new Error('Invalid app version date.');
  return state;
}

/** The assigned version is reused by server startup, watchers and image builds. */
export async function readAppVersion(root = projectRoot) {
  const { version, date } = await readState(root);
  return { version, date };
}

async function updateState(root, update) {
  const lock = resolve(root, '.version.lock');
  const deadline = Date.now() + 10000;
  for (;;) {
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) {
        throw new Error('Version file is locked. If no build is running, remove .version.lock.');
      }
      await new Promise((done) => setTimeout(done, 50));
    }
  }
  const temporary = resolve(root, `.version-${randomUUID()}.tmp`);
  try {
    const state = update(await readState(root));
    await writeFile(temporary, JSON.stringify(state, null, 2) + '\n');
    await rename(temporary, resolve(root, 'version.json'));
    return { version: state.version, date: state.date };
  } finally {
    await rm(temporary, { force: true });
    await rm(lock, { recursive: true, force: true });
  }
}

/** Reserve once per explicit build/deployment, even when sources are unchanged. */
export function reserveAppVersion(root = projectRoot) {
  return updateState(root, (state) => {
    const [major, minor] = parts(state.version);
    const previous = state.lastBuiltVersion == null ? null : parts(state.lastBuiltVersion);
    const build = previous && previous[0] === major && previous[1] === minor ? previous[2] + 1 : 0;
    const version = `${major}.${minor}.${build}`;
    parts(version);
    return { version, date: new Date().toISOString().slice(0, 10), lastBuiltVersion: version };
  });
}

/** Major/minor are chosen explicitly; the next build starts a new series at zero. */
export function setAppVersion(series, root = projectRoot) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(series)) {
    throw new Error('Choose Major.Minor, for example: npm run version:set -- 2.1');
  }
  parts(`${series}.0`);
  return updateState(root, (state) => {
    const currentSeries = parts(state.version).slice(0, 2).join('.');
    return currentSeries === series ? state : { ...state, version: `${series}.0` };
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--next') {
      console.log(JSON.stringify(await reserveAppVersion()));
    } else if (args.length === 2 && args[0] === '--set') {
      console.log(JSON.stringify(await setAppVersion(args[1])));
    } else {
      throw new Error('Usage: node scripts/app-version.mjs --next | --set Major.Minor');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
