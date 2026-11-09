// @ts-check
// Состав расширения: манифест, правила, код сервера.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { root } from './server.mjs';

const rulesLimit = 10000;

/** @param {string} path */
function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

/** Файлы .mjs в server/ с путями от корня репозитория. */
function serverFiles() {
  return readdirSync(join(root, 'server'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'));
}

test('манифест: имя, версия и MCP-сервер без contextFileName', () => {
  const manifest = JSON.parse(read('gigacode-extension.json'));
  assert.equal(manifest.name, 'spec-forge');
  assert.ok(typeof manifest.version === 'string' && manifest.version !== '', 'нужна версия');
  assert.deepEqual(Object.keys(manifest.mcpServers), ['spec-forge']);
  assert.equal(manifest.mcpServers['spec-forge'].command, 'node');
  assert.deepEqual(manifest.mcpServers['spec-forge'].args, ['${extensionPath}/server/mcp.mjs']);
  assert.equal('contextFileName' in manifest, false, 'правила подключаются через rules/, а не contextFileName');
});

test('server/ подключает только модули node: и свои файлы', () => {
  for (const file of serverFiles()) {
    for (const [, name] of read(file).matchAll(/(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      assert.match(name, /^(?:node:|\.\.?\/)/, `${file}: ${name} — npm-пакеты не допускаются`);
    }
  }
});

test('правила подключаются только для папок docs/', () => {
  const header = /^---\n([\s\S]*?)\n---\n/.exec(read('rules/spec-forge.md'));
  assert.ok(header, 'нужен заголовок между строками ---');
  assert.ok(header[1].split('\n').includes('paths: ["**/docs/**"]'), 'нужна строка paths: ["**/docs/**"]');
});

test(`правила не длиннее ${rulesLimit} букв и цифр`, () => {
  const count = (read('rules/spec-forge.md').match(/[\p{L}\p{N}]/gu) ?? []).length;
  assert.ok(count <= rulesLimit, `букв и цифр: ${count}`);
});
