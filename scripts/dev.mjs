// Lance en parallèle l'API Node et le serveur de développement Vite.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const children = [
  spawn('node', ['--watch', '--disable-warning=ExperimentalWarning', 'src/index.js'], {
    cwd: resolve(root, 'server'),
    stdio: 'inherit',
    env: { ...process.env, DATA_DIR: resolve(root, 'data') },
  }),
  spawn(npm, ['run', 'dev'], { cwd: resolve(root, 'client'), stdio: 'inherit' }),
];

const stop = () => children.forEach((child) => child.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((child) => child.on('exit', (code) => { stop(); process.exit(code ?? 0); }));
