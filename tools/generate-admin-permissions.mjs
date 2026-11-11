import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { argv, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(
  root,
  'apps/web-antd/src/infrastructure/permission/manifest.json',
);
const outputPath = resolve(root, 'permissions/generated/admin-menu-keys.json');
const checkOnly = argv.includes('--check');

const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const seenMethods = new Set();
const seenKeys = new Set();
const seenLabels = new Set();

for (const item of source) {
  if (!item || typeof item !== 'object') throw new Error('权限定义必须是对象');
  if (!/^can[A-Z]/.test(item.methodName))
    throw new Error(`方法名必须符合 canXxx：${item.methodName}`);
  for (const [field, seen] of [
    ['methodName', seenMethods],
    ['menuKey', seenKeys],
    ['labelKey', seenLabels],
  ]) {
    if (typeof item[field] !== 'string' || !item[field].trim())
      throw new Error(`${field} 不能为空`);
    if (seen.has(item[field])) throw new Error(`${field} 重复：${item[field]}`);
    seen.add(item[field]);
  }
}

const output = source
  .map(({ name, menuKey, labelKey }) => ({ name, menuKey, labelKey }))
  .toSorted((a, b) => a.menuKey.localeCompare(b.menuKey));
const content = `${JSON.stringify(output, null, 2)}\n`;

if (checkOnly) {
  const current = await readFile(outputPath, 'utf8').catch(() => '');
  if (current !== content) {
    throw new Error(
      '权限目录未更新，请运行：node tools/generate-admin-permissions.mjs',
    );
  }
  stdout.write(
    `Permission catalog is up to date (${output.length} entries).\n`,
  );
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content);
  stdout.write(
    `Generated ${output.length} permission entries: ${outputPath}\n`,
  );
}
