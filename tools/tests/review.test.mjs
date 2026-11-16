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

/** @param {string} cwd @param {Record<string, string | null>} files */
function write(cwd, files) {
  for (const [name, content] of Object.entries(files)) {
    if (content === null) {
      rmSync(join(cwd, name));
      continue;
    }
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
 * @param {Record<string, string>} old @param {Record<string, string | null>} changed @param {string[]} [args]
 */
function review(old, changed, args = ['facts', 'HEAD']) {
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
  assert.match(result.stdout, /Удалённые строки инструкций \(номера в основании\):\*\* нет\.\n/);
  assert.match(result.stdout, /Изменённые образцы \(номер начала блока и первая строка содержимого\):\*\* нет\.\n/);
});

/** Только элементы выбранного списка; другие факты не могут скрыть пропущенное удаление.
 * @param {string} output @param {string} title
 */
function items(output, title) {
  const section = output.split(`**${title}`)[1];
  assert.notEqual(section, undefined, output);
  return section.split('\n\n')[0].split('\n').slice(1).filter(Boolean);
}

test('Удалённые строки: правила и все скиллы, прежние номера; перенос, пробелы и оставшийся повтор не удаление', () => {
  const result = review({
    'rules/spec-forge.md': 'На месте\r\n  Перенести\tстроку  \r\n\t \r\nУдалено\r\nПовтор\r\nПовтор\r\n',
    'skills/sf-grill/SKILL.md': 'Старое правило\n',
    'skills/sf-note/SKILL.md': 'Ещё удалено\n',
    'skills/sf-note/references/example.md': 'Не инструкция\n',
    'tools/review-spec-forge/SKILL.md': 'Инструмент разработки\n',
    'rules/other.md': 'Другие правила\n'
  }, {
    'rules/spec-forge.md': 'Повтор\nПеренести строку\nНа месте\n',
    'skills/sf-grill/SKILL.md': 'Новое правило\n',
    'skills/sf-note/SKILL.md': '',
    'skills/sf-note/references/example.md': '',
    'tools/review-spec-forge/SKILL.md': '',
    'rules/other.md': ''
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(items(result.stdout, 'Удалённые строки'), [
    '- `rules/spec-forge.md:4` — Удалено',
    '- `skills/sf-grill/SKILL.md:1` — Старое правило',
    '- `skills/sf-note/SKILL.md:1` — Ещё удалено'
  ]);
});

test('Образцы: правка внутри блока, новый и удалённый блок; перемещённый блок не назван', () => {
  const result = review({
    'rules/spec-forge.md': '```md\nСохранён\n```\n```md\nЗаголовок\nБыло\n```\n```md\nУдалён\n```\n'
  }, {
    'rules/spec-forge.md': '```md\nДобавлен\n```\n```md\nЗаголовок\nСтало\n```\n```md\nСохранён\n```\n'
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(items(result.stdout, 'Изменённые образцы'), [
    '- `rules/spec-forge.md:4` (основание) — Заголовок',
    '- `rules/spec-forge.md:8` (основание) — Удалён',
    '- `rules/spec-forge.md:1` (рабочая версия) — Добавлен',
    '- `rules/spec-forge.md:4` (рабочая версия) — Заголовок'
  ]);
});

test('Новый и удалённые файлы: образцы видны, удалённые скиллы берутся из основания, чужие пути исключены', () => {
  const result = review({
    'rules/spec-forge.md': 'Правило\n',
    'skills/sf-old/SKILL.md': '```\nСтарый\n```\n',
    'docs/example.md': '```\nДокумент\n```\n',
    'skills/sf-old/references/example.md': '```\nСправка\n```\n'
  }, {
    'rules/spec-forge.md': null,
    'skills/sf-old/SKILL.md': null,
    'skills/sf-new/SKILL.md': '```\nНовый\n```\n',
    'docs/example.md': null,
    'skills/sf-old/references/example.md': null
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(items(result.stdout, 'Удалённые строки'), [
    '- `rules/spec-forge.md:1` — Правило',
    '- `skills/sf-old/SKILL.md:1` — ```',
    '- `skills/sf-old/SKILL.md:2` — Старый',
    '- `skills/sf-old/SKILL.md:3` — ```'
  ]);
  assert.deepEqual(items(result.stdout, 'Изменённые образцы'), [
    '- `skills/sf-new/SKILL.md:1` (рабочая версия) — Новый',
    '- `skills/sf-old/SKILL.md:1` (основание) — Старый'
  ]);
});

test('Копии одинакового блока: добавление и удаление лишней копии видны', () => {
  const block = '```\nПример\n```\n';
  for (const [was, current, version] of [[1, 2, 'рабочая версия'], [2, 1, 'основание']]) {
    const result = review({ 'rules/spec-forge.md': block.repeat(Number(was)) }, {
      'rules/spec-forge.md': block.repeat(Number(current))
    });
    assert.deepEqual(items(result.stdout, 'Изменённые образцы'), [
      `- \`rules/spec-forge.md:4\` (${version}) — Пример`
    ]);
  }
});

test('Ограждения: длинные, с отступом и тильдами; более короткое или другого вида не закрывает блок', () => {
  const result = review({
    'skills/sf-spec/SKILL.md': '  ````md\nПример\n```\nБыло\n  `````\n~~~md\nВторой\n```\nБыло\n~~~~\n'
  }, {
    'skills/sf-spec/SKILL.md': '  ````md\nПример\n```\nСтало\n  `````\n~~~md\nВторой\n```\nСтало\n~~~~\n'
  });
  assert.deepEqual(items(result.stdout, 'Изменённые образцы'), [
    '- `skills/sf-spec/SKILL.md:1` (основание) — Пример',
    '- `skills/sf-spec/SKILL.md:6` (основание) — Второй',
    '- `skills/sf-spec/SKILL.md:1` (рабочая версия) — Пример',
    '- `skills/sf-spec/SKILL.md:6` (рабочая версия) — Второй'
  ]);
});

test('Содержимое образцов сравнивается точно: пробел значим; вид ограждения, язык и CRLF не значимы', () => {
  const result = review({
    'rules/spec-forge.md': '```md\r\nБез правок\r\n```\r\n~~~\r\nДва  пробела\r\n~~~\r\n'
  }, {
    'rules/spec-forge.md': '~~~text\nБез правок\n~~~\n```\nДва пробела\n```\n'
  });
  assert.deepEqual(items(result.stdout, 'Изменённые образцы'), [
    '- `rules/spec-forge.md:4` (основание) — Два  пробела',
    '- `rules/spec-forge.md:4` (рабочая версия) — Два пробела'
  ]);
  assert.deepEqual(items(result.stdout, 'Удалённые строки'), ['- `rules/spec-forge.md:1` — ```md']);
});

test('Пустой блок отличается от блока с пустой строкой; незакрытый блок продолжается до конца файла', () => {
  const result = review({ 'rules/spec-forge.md': '```\n```\n' }, {
    'rules/spec-forge.md': '```\n\n```\n~~~\nБез закрывающей строки\n'
  });
  assert.deepEqual(items(result.stdout, 'Изменённые образцы'), [
    '- `rules/spec-forge.md:1` (основание) — ',
    '- `rules/spec-forge.md:1` (рабочая версия) — ',
    '- `rules/spec-forge.md:4` (рабочая версия) — Без закрывающей строки'
  ]);
});

test('Неизвестное основание — ошибка, а не пустой отчёт', () => {
  const result = review({}, {}, ['facts', 'no-such-branch']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Не найдено основание сравнения: no-such-branch/);
});

/** Сверка цитат отчёта с файлом кода из трёх строк. @param {string} report */
function quotes(report) {
  return review({ 'server/check.mjs': 'первая\n  if (a  ===  b) return;\nтретья\n' }, { 'report.md': report }, ['quotes', 'report.md']);
}

test('Цитаты: фрагмент названной строки найден, отступы и пробелы подряд не мешают', () => {
  const result = quotes('1. Замечание.\n   - `server/check.mjs:2`\n     > if (a === b) return;\n');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout, 'Мест с цитатами: 1, расхождений: 0.\n');
});

test('Цитаты: другая строка, отсутствующая цитата, отсутствующий файл и пустая цитата названы', () => {
  const result = quotes([
    '- `server/check.mjs:1`', '  > третья',
    '- `server/check.mjs:3`', '  > такого текста нет',
    '- `server/none.mjs:1`', '  > первая',
    '- `server/check.mjs:2`', '  >',
    '- `server/check.mjs:1`', '  > первая'
  ].join('\n'));
  assert.equal(result.status, 1);
  assert.equal(result.stdout, [
    'Мест с цитатами: 5, расхождений: 4.',
    '- `server/check.mjs:1` — цитата стоит в строке 3: третья',
    '- `server/check.mjs:3` — цитаты нет в файле: такого текста нет',
    '- `server/none.mjs:1` — файла нет: первая',
    '- `server/check.mjs:2` — цитата пустая: ',
    ''
  ].join('\n'));
});

test('Цитаты: место без цитаты под ним не проверяется, отчёт без цитат — ошибка', () => {
  const result = quotes('Смотри `server/check.mjs:2` и текст дальше.\n\n> не под местом\n');
  assert.equal(result.status, 1);
  assert.equal(result.stdout, 'Мест с цитатами: 0, расхождений: 0.\n');
});

test('Нет файла отчёта и неизвестная команда — ошибка', () => {
  const missing = review({}, {}, ['quotes', 'none.md']);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Нет файла отчёта: .*none\.md/);
  const unknown = review({}, {}, ['HEAD']);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Неизвестная команда: HEAD\. Есть facts и quotes\./);
});
