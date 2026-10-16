// Local development: the API in simulated mode (demo world, test credits)
// on :8787 and the Vite dev server on :5173, which proxies /api to it.
//
//   npm run dev      then open http://localhost:5173

import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const children = [
  spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--watch', 'src/node/main.ts'], {
    cwd: join(root, 'server'),
    env: { ...process.env, ZEMVII_SIMULATED: '1' },
    stdio: 'inherit',
  }),
  spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--host', '127.0.0.1'], {
    cwd: join(root, 'web'),
    stdio: 'inherit',
  }),
];

const stop = () => {
  for (const child of children) child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', (code) => code && stop());
