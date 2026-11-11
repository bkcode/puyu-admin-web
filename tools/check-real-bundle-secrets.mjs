import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const workspace = path.resolve(project, '../..');
const source = JSON.parse(
  fs.readFileSync(
    path.join(workspace, '.local/puyu-admin/secrets.json'),
    'utf8',
  ),
);
const keys = [
  'adminClient',
  'webClient',
  'authCore',
  'adminPassword',
  'coreApp',
  'coreMigrate',
  'authApp',
  'authMigrate',
];
const needles = keys
  .map((key) => source[key])
  .filter((value) => typeof value === 'string' && value.length >= 32);
if (needles.length !== keys.length)
  throw new Error('Expected approved local credential set');
needles.push(
  Buffer.from(`puyu-admin:${source.adminClient}`).toString('base64'),
);
let files = 0;
function check(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) check(file);
    else if (/\.(js|json|html|map|css)$/.test(entry.name)) {
      const content = fs.readFileSync(file, 'utf8');
      files++;
      if (needles.some((secret) => content.includes(secret)))
        throw new Error(
          'Private credential found in browser output; publication forbidden',
        );
    }
  }
}
check(path.join(project, 'apps/web-antd/dist'));
if (files === 0) throw new Error('No built assets to inspect');
process.stdout.write(
  `PASS: ${files} browser artifacts contain no local server credentials or OAuth Basic secret\n`,
);
