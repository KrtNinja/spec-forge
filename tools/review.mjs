// @ts-check
// Помощник ревью изменений. Только читает репозиторий и печатает отчёт.
//   node tools/review.mjs facts [основание] — объём контекста модели и ссылки случаев на требования;
//     сравнивается общий предок основания (по умолчанию main) и текущей версии с файлами в рабочей папке.
//   node tools/review.mjs quotes <файл отчёта> — стоят ли цитаты отчёта ревью в названных строках файлов.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const rules = 'rules/spec-forge.md';
const casesDir = 'tests/mcp';

/** @param {string[]} args */
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** @param {string[]} args */
function tryGit(args) {
  try {
    return git(args);
  } catch {
    return '';
  }
}

/** Общий предок основания и текущей версии; без общей истории — само основание. @param {string} name */
function baseCommit(name) {
  const commit = (tryGit(['merge-base', name, 'HEAD']) || tryGit(['rev-parse', '--verify', `${name}^{commit}`])).trim();
  if (!commit) throw new Error(`Не найдено основание сравнения: ${name}`);
  return commit;
}

/** Коммит, с которым сравнивает facts. */
let base = '';

/** Файл в основании; нет файла — пустая строка. @param {string} path */
function before(path) {
  return tryGit(['show', `${base}:${path}`]);
}

/** Файл в рабочей папке; нет файла — пустая строка. @param {string} path */
function now(path) {
  return existsSync(path) && statSync(path).isFile() ? readFileSync(path, 'utf8') : '';
}

/** Буквы и цифры — та же мера, что в пределе для правил и скиллов. @param {string} text */
function count(text) {
  return (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

/** Папки внутри папки рабочего дерева. @param {string} dir */
function folders(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

/** Имена скиллов в основании и сейчас. */
function skills() {
  const old = tryGit(['ls-tree', '-d', '--name-only', base, 'skills/']).split('\n').filter(Boolean)
    .map((path) => path.replace('skills/', ''));
  return [...new Set([...old, ...folders('skills')])].sort();
}

/** @param {string} name @param {number} was @param {number} is */
function row(name, was, is) {
  const diff = is - was;
  return `| ${name} | ${was} | ${is} | ${diff > 0 ? '+' : ''}${diff} |`;
}

function context() {
  const [rulesWas, rulesIs] = [count(before(rules)), count(now(rules))];
  const rows = skills().map((name) => {
    const skill = `skills/${name}/SKILL.md`;
    return row(`${name}: правила и скилл`, rulesWas + count(before(skill)), rulesIs + count(now(skill)));
  });
  return [
    '## Контекст модели, буквы и цифры',
    '',
    '| Что читает модель | Было | Стало | Разница |',
    '|---|---|---|---|',
    row(`\`${rules}\` (входит в каждую строку ниже)`, rulesWas, rulesIs),
    ...rows,
    '',
    'Ответы инструмента в подсчёт не входят.'
  ];
}

/** Номера FR, объявленные в требованиях. */
function definedFr() {
  const files = ['docs/product-requirements.md', ...folders('docs').map((name) => `docs/${name}/requirements.md`)];
  return new Set(files.flatMap((file) => [...now(file).matchAll(/^\*\*(FR-\d+)\.\*\*/gm)].map((match) => match[1])));
}

/** Все случаи: имя «группа/случай», строка «Когда» и ссылки. */
function cases() {
  return folders(casesDir).flatMap((group) => folders(`${casesDir}/${group}`).map((name) => {
    const input = JSON.parse(now(`${casesDir}/${group}/${name}/input.json`) || '{}');
    return { name: `${group}/${name}`, when: String(input.when ?? ''), refs: /** @type {string[]} */ (input.refs ?? []) };
  }));
}

/** Ссылка вида «core/design.md: Раздел» ведёт на существующий заголовок. @param {string} ref */
function sectionExists(ref) {
  const match = /^(\S+\.md): (.+)$/.exec(ref);
  if (!match) return false;
  return now(`docs/${match[1]}`).split('\n').some((line) => /^#+ /.test(line) && line.replace(/^#+ /, '').trim() === match[2]);
}

/** @param {string} title @param {string[]} items */
function list(title, items) {
  return ['', `**${title}:** ${items.length === 0 ? 'нет.' : ''}`, ...items.map((item) => `- ${item}`)];
}

/** Случаи, файлы которых отличаются от основания. @param {ReturnType<typeof cases>} all */
function changedCases(all) {
  const names = tryGit(['diff', '--name-only', base, '--', casesDir]).split('\n').filter(Boolean)
    .map((path) => path.split('/').slice(2, 4).join('/'));
  return [...new Set(names)].sort().map((name) => {
    const found = all.find((item) => item.name === name);
    return found ? `\`${name}\` — ${found.when} (${found.refs.join('; ')})` : `\`${name}\` — удалён`;
  });
}

function references() {
  const all = cases();
  const defined = definedFr();
  const used = new Set(all.flatMap((item) => item.refs));
  const broken = all.flatMap((item) => item.refs
    .filter((ref) => (/^FR-\d+$/.test(ref) ? !defined.has(ref) : !sectionExists(ref)))
    .map((ref) => `\`${item.name}\` → ${ref}`));
  return [
    '## Ссылки случаев на требования',
    ...list('Ссылки на несуществующие FR и разделы устройства', broken),
    ...list('FR без случаев', [[...defined].filter((fr) => !used.has(fr)).sort().join(', ')].filter(Boolean)),
    ...list('Изменённые случаи', changedCases(all))
  ];
}

/** @param {string} name */
function facts(name) {
  base = baseCommit(name);
  console.log([`# Факты для ревью: основание ${base.slice(0, 7)}`, '', ...context(), '', ...references()].join('\n'));
}

/** Пробелы подряд — один пробел, по краям — нет: отступы и выравнивание цитате не мешают. @param {string} text */
function squeeze(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/** Места отчёта: строка с `путь:строка`, сразу под ней — цитата после «> ». @param {string} report */
function places(report) {
  const lines = report.split('\n');
  return lines.flatMap((line, index) => {
    const place = /`([^`\s]+):(\d+)`/.exec(line);
    const quote = /^\s*> ?(.*)$/.exec(lines[index + 1] ?? '');
    return place && quote ? [{ path: place[1], line: Number(place[2]), quote: squeeze(quote[1]) }] : [];
  });
}

/** Что не так с местом; пустая строка — цитата стоит в названной строке. @param {ReturnType<typeof places>[number]} place */
function mismatch({ path, line, quote }) {
  if (!existsSync(path) || !statSync(path).isFile()) return 'файла нет';
  if (!quote) return 'цитата пустая';
  const lines = now(path).split('\n').map(squeeze);
  if ((lines[line - 1] ?? '').includes(quote)) return '';
  const found = lines.findIndex((text) => text.includes(quote));
  return found === -1 ? 'цитаты нет в файле' : `цитата стоит в строке ${found + 1}`;
}

/** @param {string} file */
function quotes(file) {
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`Нет файла отчёта: ${file}`);
  const all = places(readFileSync(file, 'utf8'));
  const wrong = all.map((place) => ({ ...place, problem: mismatch(place) })).filter((place) => place.problem);
  console.log([
    `Мест с цитатами: ${all.length}, расхождений: ${wrong.length}.`,
    ...wrong.map((place) => `- \`${place.path}:${place.line}\` — ${place.problem}: ${place.quote}`)
  ].join('\n'));
  if (all.length === 0 || wrong.length > 0) process.exitCode = 1;
}

const [command, argument] = process.argv.slice(2);
// Путь отчёта задан от папки запуска; файлы из отчёта и репозиторий читаются от корня.
const reportFile = resolve(argument ?? '');
process.chdir(git(['rev-parse', '--show-toplevel']).trim());

switch (command) {
  case 'facts': facts(argument ?? 'main'); break;
  case 'quotes': quotes(reportFile); break;
  default: throw new Error(`Неизвестная команда: ${command}. Есть facts и quotes.`);
}
