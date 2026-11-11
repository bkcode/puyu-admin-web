import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Explicit local-only launcher. The confidential OAuth secret stays in the Vite process.
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const workspace = path.resolve(project, '../..');
const credentials = JSON.parse(
  fs.readFileSync(
    path.join(workspace, '.local/puyu-admin/secrets.json'),
    'utf8',
  ),
);
if (
  credentials.owner !== 'puyu-admin-local' ||
  typeof credentials.adminClient !== 'string' ||
  credentials.adminClient.length < 32
)
  throw new Error('Expected approved local Puyu credentials');
const child = spawn(
  'mise',
  [
    'exec',
    'node@24.18.0',
    '--',
    'corepack',
    'pnpm',
    '-F',
    '@vben/web-antd',
    'dev',
    '--host',
    '127.0.0.1',
    '--port',
    '5666',
    '--strictPort',
  ],
  {
    cwd: project,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_PUYU_DATA_MODE: 'real',
      VITE_NITRO_MOCK: 'false',
      PUYU_ADMIN_CLIENT_SECRET: credentials.adminClient,
    },
  },
);
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
