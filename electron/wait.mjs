import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET = 'http://127.0.0.1:5173';

function probe() {
  return new Promise((resolve) => {
    const req = http.get(TARGET, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => { req.destroy(); resolve(false); });
  });
}

let tries = 0;
while (tries < 120) {
  if (await probe()) break;
  tries += 1;
  await new Promise((r) => setTimeout(r, 500));
}

const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const child = spawn(electronBin, [path.join(__dirname, '..')], {
  stdio: 'inherit',
  env: { ...process.env, OA_DEV: '1' },
});
child.on('exit', (code) => process.exit(code ?? 0));
