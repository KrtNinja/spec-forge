// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const script = resolve(import.meta.dirname, '../review.mjs');

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { cwd });
}

/** @param {string} cwd @param {Record<string, string>} files */
function write(cwd, files) {
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(cwd, name)), { recursive: true });
    writeFileSync(join(cwd, name), content);
  }
}

/** @param {string} when @param {string[]} refs */
function input(when, refs) {
  return JSON.stringify({ when, refs, call: {} });
}

/**
 * Отчёт для репозитория: коммит с файлами основания, затем файлы изменения.
 * @param {Record<string, string>} old @param {Record<string, string>} changed @param {string[]} [args]
 */
function review(old, changed, args = ['HEAD']) {
  const cwd = mkdtempSync(join(tmpdir(), 'spec-forge-review-'));
  try {
    git(cwd, ['init', '-q']);
    write(cwd, { 'README.md': 'основание', ...old });
    git(cwd, ['add', '.']);
    git(cwd, ['commit', '-q', '-m', 'основание']);
    write(cwd, changed);
    git(cwd, ['add', '.']);
    return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('Контекст: буквы и цифры правил и скилла до и после, новый скилл считается с нуля', () => {
  const result = review(
    { 'rules/spec-forge.md': 'аб, 1!', 'skills/sf-grill/SKILL.md': 'где' },
    { 'skills/sf-grill/SKILL.md': 'г', 'skills/sf-note/SKILL.md': 'новое' }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\| `rules\/spec-forge\.md` \(входит в каждую строку ниже\) \| 3 \| 3 \| 0 \|/);
  assert.match(result.stdout, /\| sf-grill: правила и скилл \| 6 \| 4 \| -2 \|/);
  assert.match(result.stdout, /\| sf-note: правила и скилл \| 3 \| 8 \| \+5 \|/);
});

test('Ссылки: несуществующие FR и разделы названы, существующие — нет', () => {
  const result = review({
    'docs/product-requirements.md': '**FR-01.** Первое.\n\nУпоминание FR-09 не объявляет требование.\n',
    'docs/core/design.md': '# Устройство\n\n## Проверки\n',
    'tests/mcp/check/good/input.json': input('верные ссылки', ['FR-01', 'core/design.md: Проверки']),
    'tests/mcp/check/bad/input.json': input('неверные ссылки', ['FR-09', 'core/design.md: Нет раздела', 'просто текст'])
  }, {});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /- `check\/bad` → FR-09\n- `check\/bad` → core\/design\.md: Нет раздела\n- `check\/bad` → просто текст\n/);
  assert.doesNotMatch(result.stdout, /`check\/good` →/);
});

test('FR без случаев: требования основы и этапов, на которые не ссылается ни один случай', () => {
  const result = review({
    'docs/product-requirements.md': '**FR-01.** Первое.\n\n**FR-02.** Второе.\n',
    'docs/sf-note/requirements.md': '**FR-24.** Этап.\n',
    'tests/mcp/check/one/input.json': input('случай', ['FR-02'])
  }, {});
  assert.match(result.stdout, /\*\*FR без случаев:\*\* \n- FR-01, FR-24\n/);
});

test('Изменённые случаи: новый и изменённый — со строкой «Когда» и ссылками, прежний не назван', () => {
  const result = review({
    'docs/product-requirements.md': '**FR-01.** Первое.\n',
    'tests/mcp/check/same/input.json': input('без изменений', ['FR-01']),
    'tests/mcp/check/edited/input.json': input('ответ изменён', ['FR-01']),
    'tests/mcp/check/edited/expected.md': 'было'
  }, {
    'tests/mcp/check/edited/expected.md': 'стало',
    'tests/mcp/status/added/input.json': input('новый случай', ['FR-01', 'FR-01'])
  });
  assert.match(result.stdout, /\*\*Изменённые случаи:\*\* \n- `check\/edited` — ответ изменён \(FR-01\)\n- `status\/added` — новый случай \(FR-01; FR-01\)\n$/);
  assert.doesNotMatch(result.stdout, /check\/same/);
});

test('Без изменений и без ошибок каждый список отвечает «нет»', () => {
  const result = review({
    'docs/product-requirements.md': '**FR-01.** Первое.\n',
    'tests/mcp/check/one/input.json': input('случай', ['FR-01'])
  }, {});
  assert.match(result.stdout, /несуществующие FR и разделы устройства:\*\* нет\.\n/);
  assert.match(result.stdout, /FR без случаев:\*\* нет\.\n/);
  assert.match(result.stdout, /Изменённые случаи:\*\* нет\.\n$/);
});

test('Неизвестное основание — ошибка, а не пустой отчёт', () => {
  const result = review({}, {}, ['no-such-branch']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Не найдено основание сравнения: no-such-branch/);
});
