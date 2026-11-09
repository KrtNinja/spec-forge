import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

/** @param {Record<string, string>} files @param {string} command */
function fixture(files, command) {
  const cwd = mkdtempSync(join(tmpdir(), 'spec-forge-check-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd });
    mkdirSync(join(cwd, 'tools'));
    copyFileSync(join(root, 'tools/check.mjs'), join(cwd, 'tools/check.mjs'));
    copyFileSync(join(root, 'tools/eslint.config.mjs'), join(cwd, 'tools/eslint.config.mjs'));
    symlinkSync(join(root, 'tools/node_modules'), join(cwd, 'tools/node_modules'), 'dir');
    writeFileSync(join(cwd, 'package.json'), '{"type":"module"}');
    for (const [name, content] of Object.entries(files)) writeFileSync(join(cwd, name), content);
    execFileSync('git', ['add', 'tools', 'package.json', ...Object.keys(files)], { cwd });
    const env = { ...process.env };
    delete env.GITHUB_STEP_SUMMARY;
    delete env.NODE_TEST_CONTEXT;
    return spawnSync(process.execPath, [join(root, 'tools/check.mjs'), command], { cwd: join(cwd, 'tools'), env, encoding: 'utf8' });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('Без рабочего кода отсутствие тестов сообщается явно', () => {
  const result = fixture({}, 'test');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Тестов пока нет/);
});

test('Рабочий код без тестов отклоняется', () => {
  const result = fixture({ 'value.js': 'export const value = 1;' }, 'test');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /нет тестов продукта/);
});

test('Успешный тест проходит', () => {
  const result = fixture({ 'value.test.js': 'import { test } from "node:test"; test("ok", () => {});' }, 'test');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /pass 1/);
});

test('Падение теста приводит к ошибке команды', () => {
  const result = fixture({ 'value.test.js': 'throw new Error("expected failure");' }, 'test');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /expected failure/);
});

test('ESLint отклоняет неизвестную переменную', () => {
  const result = fixture({ 'value.test.js': 'missingFunction();' }, 'check');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /no-undef/);
});

test('Проверка типов отклоняет неверный тип', () => {
  const result = fixture({ 'value.test.js': '/** @type {number} */\nexport const value = "wrong";' }, 'check');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /TS2322/);
});

test('Без рабочего кода mutator не вызывается', () => {
  const result = fixture({}, 'mutate');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /мутационные тесты не выполнялись/);
});

test('Неизвестная команда не выдаёт успешный результат', () => {
  const result = fixture({}, 'unknown');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Неизвестная проверка/);
});

test('Слишком сложная функция отклоняется', () => {
  const cases = Array.from({ length: 10 }, (_, n) => `case ${n}: return ${n};`).join('\n');
  const result = fixture({
    'value.test.js': `/** @param {number} value */\nexport function choose(value) { switch (value) { ${cases} } }`
  }, 'check');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /complexity/);
});

test('Файл длиннее 350 строк отклоняется, комментарии считаются', () => {
  const result = fixture({ 'value.test.js': '// строка\n'.repeat(351) }, 'check');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /max-lines/);
});

test('Повторы сверх порога отклоняются', () => {
  const body = Array.from({ length: 12 }, (_, n) => `console.log("message ${n}");`).join('\n');
  const result = fixture({ 'one.test.js': body, 'two.test.js': body }, 'check');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /threshold/i);
});

test('Полная проверка корректного кода проходит', () => {
  const result = fixture({ 'value.test.js': 'export const value = 1;' }, 'check');
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
