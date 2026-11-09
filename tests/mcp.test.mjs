// @ts-check
// Общий тест случаев вызова spec_forge. Случай — папка tests/mcp/<группа>/<случай>/,
// её формат описан в tools/README.md. Новый случай — новая папка, без нового кода.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { exchange, handshake, message } from './server.mjs';

const cases = join(import.meta.dirname, 'mcp');
const answers = ['expected.md', 'error.md'];

/** @param {string} dir */
function folders(dir) {
  return readdirSync(dir).map((name) => join(dir, name));
}

/** @param {string} base @param {string} path */
function name(base, path) {
  return relative(base, path).split(sep).join('/');
}

/**
 * Все файлы папки: путь от неё → содержимое. Нет папки — нет файлов.
 * @param {string} dir
 */
function readTree(dir) {
  /** @type {Record<string, string>} */
  const files = {};
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) files[name(dir, join(entry.parentPath, entry.name))] = readFileSync(join(entry.parentPath, entry.name), 'utf8');
  }
  return files;
}

/** @param {string} dir */
function readCase(dir) {
  assert.ok(statSync(dir).isDirectory(), 'случай должен быть папкой');
  const inputPath = join(dir, 'input.json');
  assert.ok(existsSync(inputPath), 'нет input.json');
  const input = JSON.parse(readFileSync(inputPath, 'utf8'));
  assert.deepEqual(Object.keys(input).sort(), ['call', 'refs', 'when'], 'в input.json нужны ровно when, refs и call');
  const found = answers.filter((file) => existsSync(join(dir, file)));
  assert.equal(found.length, 1, 'нужен ровно один файл: expected.md или error.md');
  const after = existsSync(join(dir, 'after')) ? 'after' : 'before';
  return {
    call: input.call,
    answer: readFileSync(join(dir, found[0]), 'utf8').replace(/\n$/, ''),
    isError: found[0] === 'error.md',
    before: join(dir, 'before'),
    after: join(dir, after)
  };
}

for (const dir of folders(cases).flatMap(folders)) {
  test(name(cases, dir), async () => {
    const spec = readCase(dir);
    const cwd = mkdtempSync(join(tmpdir(), 'spec-forge-case-'));
    try {
      if (existsSync(spec.before)) cpSync(spec.before, cwd, { recursive: true });
      const call = message('tools/call', { name: 'spec_forge', arguments: spec.call }, 2);
      const replies = await exchange(cwd, [...handshake(), call]);
      const result = replies.find((reply) => reply.id === 2)?.result;
      assert.ok(result, 'нет результата tools/call');
      assert.deepEqual(result.content, [{ type: 'text', text: spec.answer }], 'текст ответа');
      assert.equal(result.isError === true, spec.isError, 'признак ошибки isError');
      assert.deepEqual(readTree(cwd), readTree(spec.after), 'документы после вызова');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}
