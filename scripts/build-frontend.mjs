import { createHash } from 'node:crypto';
import { watch } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Script } from 'node:vm';
import { scripts, styles, media, staticFiles } from './frontend-sources.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const outputDirectory = resolve(root, 'public/assets');

/** Combine shared-scope source files without changing their initialization order. */
async function combine(files, outputName) {
  if (new Set(files).size !== files.length) throw new Error('Duplicate frontend source');
  const contents = await Promise.all(files.map((file) => readFile(resolve(root, file), 'utf8')));
  const sections = [];
  let code = '';
  let line = 0;

  for (const [index, file] of files.entries()) {
    const text = contents[index].trimEnd() + '\n';
    code += `/* Source: ${file} */\n`;
    line++;
    sections.push({
      offset: { line, column: 0 },
      map: {
        version: 3,
        sources: ['../../' + file],
        sourcesContent: [text],
        names: [],
        mappings: text
          .trimEnd()
          .split('\n')
          .map((_, i) => (i ? 'AACA' : 'AAAA'))
          .join(';'),
      },
    });
    code += text + '\n';
    line += text.split('\n').length;
  }

  const map = { version: 3, file: outputName, sections };
  const comment = outputName.endsWith('.css')
    ? `/*# sourceMappingURL=${outputName}.map */\n`
    : `//# sourceMappingURL=${outputName}.map\n`;
  return { code: code + comment, map: JSON.stringify(map) };
}

/** Atomic writes keep the dev server from serving a partially written bundle. */
async function writeChanged(file, content) {
  try {
    const previous = await readFile(file);
    if (previous.equals(Buffer.from(content))) return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, file);
}

export async function buildFrontend() {
  const [javascript, css] = await Promise.all([
    combine(scripts, 'app.js'),
    combine(styles, 'app.css'),
  ]);
  // This app deliberately keeps one classic script: existing inline handlers
  // and shared state retain their scope and function hoisting across files.
  new Script(javascript.code, { filename: 'app.js' });
  await Promise.all([
    writeChanged(resolve(outputDirectory, 'app.js'), javascript.code),
    writeChanged(resolve(outputDirectory, 'app.js.map'), javascript.map),
    writeChanged(resolve(outputDirectory, 'app.css'), css.code),
    writeChanged(resolve(outputDirectory, 'app.css.map'), css.map),
    ...media.map(async (file) =>
      writeChanged(resolve(root, 'public', file), await readFile(resolve(root, file))),
    ),
    ...staticFiles.map(async (file) =>
      writeChanged(resolve(root, 'public', file), await readFile(resolve(root, file))),
    ),
  ]);
  return {
    scripts: scripts.length,
    styles: styles.length,
    hash: createHash('sha256').update(javascript.code).update(css.code).digest('hex').slice(0, 12),
  };
}

export function watchFrontend() {
  let timer;
  let running = false;
  let pending = false;
  const rebuild = async () => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      const result = await buildFrontend();
      console.log(`Frontend rebuilt (${result.hash}). Refresh the browser to view changes.`);
    } catch (error) {
      console.error('Frontend build failed:', error.message);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        schedule();
      }
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 80);
  };
  const watchers = ['src', 'styles', 'assets', 'shared'].map((directory) =>
    watch(resolve(root, directory), { recursive: true }, schedule),
  );
  return {
    close() {
      clearTimeout(timer);
      watchers.forEach((watcher) => watcher.close());
    },
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = await buildFrontend();
  console.log(
    `Built ${result.scripts} JavaScript files and ${result.styles} stylesheets (${result.hash}).`,
  );
}
