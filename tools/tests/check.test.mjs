import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

/**
 * Запускает check.mjs во временном репозитории. Исполняемые файлы из files доступны по имени.
 * @param {Record<string, string>} files @param {string | string[]} command @param {Record<string, string>} [extra] переменные окружения
 */
function fixture(files, command, extra = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'spec-forge-check-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd });
    mkdirSync(join(cwd, 'tools'));
    for (const name of ['check.mjs', 'eslint.config.mjs', 'mutation-reporter.mjs']) copyFileSync(join(root, 'tools', name), join(cwd, 'tools', name));
    symlinkSync(join(root, 'tools/node_modules'), join(cwd, 'tools/node_modules'), 'dir');
    writeFileSync(join(cwd, 'package.json'), '{"type":"module"}');
    for (const [name, content] of Object.entries(files)) writeFileSync(join(cwd, name), content, { mode: 0o755 });
    execFileSync('git', ['add', 'tools', 'package.json', ...Object.keys(files)], { cwd });
    /** @type {NodeJS.ProcessEnv} */
    const env = { ...process.env, PATH: `${cwd}:${process.env.PATH}`, ...extra };
    delete env.NODE_TEST_CONTEXT;
    if (!extra.GITHUB_STEP_SUMMARY) delete env.GITHUB_STEP_SUMMARY;
    return spawnSync(process.execPath, [join(root, 'tools/check.mjs'), ...[command].flat()], { cwd: join(cwd, 'tools'), env, encoding: 'utf8' });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

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

// Подмена mutator: один раз запускает команду тестов, добавляет запуск без конца
// (так выглядит мутация, оборванная по пределу времени) и сообщает об одной выжившей мутации.
const fakeMutator = `#!/bin/sh
for file; do :; done
while [ "$1" != --test-command ]; do shift; done
sh -c "$2" > /dev/null
echo start >> "$MUTATION_LOG"
printf 'KILLED    %s:1 a -> b\nSURVIVED  %s:2 a -> b\n' "$file" "$file"
exit 3
`;

const mutated = {
  'value.js': 'export const value = 1;',
  'value.test.js': 'import { test } from "node:test"; test("ok", () => {});',
  mutator: fakeMutator
};

test('Мутационный прогон файла: строка итогов и код завершения mutator', () => {
  const summary = join(tmpdir(), `spec-forge-summary-${process.pid}.md`);
  try {
    const result = fixture(mutated, ['mutate', 'value.js'], { GITHUB_STEP_SUMMARY: summary });
    assert.equal(result.status, 3, result.stdout + result.stderr);
    const row = /^\| value\.js \| 2 \| 1 \| 1 \| 1 \| \d+\.\d \| \d+ \|$/m;
    assert.match(result.stdout, row);
    assert.match(readFileSync(summary, 'utf8'), row);
  } finally {
    rmSync(summary, { force: true });
  }
});

test('Мутационный прогон без имени файла проверяет все файлы продукта', () => {
  const result = fixture({ ...mutated, 'other.js': 'export const other = 2;' }, 'mutate');
  assert.equal(result.status, 3, result.stdout + result.stderr);
  assert.match(result.stdout, /^\| other\.js \| 2 \|.*\n(.*\n)*\| value\.js \| 2 \|/m);
});

test('Мутационный прогон отклоняет файл не из продукта', () => {
  const result = fixture(mutated, ['mutate', 'value.test.js']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Нет такого файла продукта: value\.test\.js/);
  assert.doesNotMatch(result.stdout, /KILLED/);
});

test('Список файлов для мутаций — рабочий код без тестов, tools и настроек', () => {
  const result = fixture({ ...mutated, 'some.config.mjs': 'export default {};' }, 'mutate-files');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '["value.js"]\n');
});

test('Мутационный прогон файла без мест мутаций: в строке итогов нет времени исходных тестов', () => {
  const result = fixture({ ...mutated, mutator: '#!/bin/sh\nexit 0\n' }, ['mutate', 'value.js']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^\| value\.js \| 0 \| 0 \| 0 \| 0 \| — \| \d+ \|$/m);
});
