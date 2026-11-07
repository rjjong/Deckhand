import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { reserveAppVersion } from './app-version.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = await reserveAppVersion();
console.log(`Building Deckhand ${version.version}.`);
// Reserve in the checkout so container rebuilds share the persistent counter.
// The Dockerfile reuses this version instead of reserving a second number.
const args = process.argv.slice(2);
const useSudo = args.includes('--sudo');
const command = useSudo ? 'sudo' : 'docker';
const buildArgs = ['compose', 'build', ...args.filter((arg) => arg !== '--sudo')];
const child = spawn(command, useSudo ? ['docker', ...buildArgs] : buildArgs, {
  cwd: root,
  stdio: 'inherit',
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
