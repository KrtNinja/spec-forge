// @ts-check
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

/** @param {string} command @param {string[]} args */
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** @param {string} name @param {string[]} args */
function bin(name, args) {
  run(process.execPath, [`tools/node_modules/${name}`, ...args]);
}

// Проверки охватывают весь репозиторий, даже при запуске npm из tools.
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0').filter((file) => /\.(?:mjs|cjs|js)$/.test(file));
const tests = files.filter((file) => /\.(?:test|spec)\.(?:mjs|cjs|js)$/.test(file));
const code = files.filter((file) => !file.startsWith('tests/') && !tests.includes(file));
const product = code.filter((file) => !file.startsWith('tools/') && !file.endsWith('.config.mjs'));
const command = process.argv[2];

if (product.length > 0 && tests.every((file) => file.startsWith('tools/'))) {
  throw new Error('Есть рабочий JavaScript-код, но нет тестов продукта. Добавьте *.test.js, *.test.mjs или *.test.cjs.');
}

function test() {
  run(process.execPath, ['--test', ...tests]);
}

function check() {
  bin('eslint/bin/eslint.js', ['--config', 'tools/eslint.config.mjs', '--max-warnings=0', ...files]);
  bin('typescript/bin/tsc', [
    '--allowJs', '--checkJs', '--noEmit', '--strict', '--skipLibCheck',
    '--target', 'ES2022', '--module', 'NodeNext', '--typeRoots', 'tools/node_modules/@types', '--types', 'node', ...files
  ]);
  duplicates(code, '2', 'code');
  duplicates(tests, '10', 'tests');
}

/** @param {string[]} paths @param {string} threshold @param {string} name */
function duplicates(paths, threshold, name) {
  if (paths.length === 0) return;
  bin('jscpd/bin/jscpd', [
    '--threshold', threshold, '--reporters', 'console,json',
    '--output', `reports/duplicates-${name}`, ...paths
  ]);
}

function coverage() {
  bin('c8/bin/c8.js', [
    '--all', '--reporter=text', '--reporter=html', '--reporter=lcov',
    ...code.flatMap((file) => ['--include', file]),
    process.execPath, '--test', ...tests
  ]);
}

// mutator запускает команду в рабочей папке, где изменённый файл — копия, а остальное — ссылки
// на исходное дерево. Команда не ищет корень через git (это вернуло бы исходное дерево)
// и запускает только тесты продукта: проверки tools/ от кода продукта не зависят.
// Файлы идут по одному, отдельным запуском mutator: так у каждого своя строка итогов.
function mutate() {
  const productTests = tests.filter((file) => !file.startsWith('tools/'));
  const testCommand = ['node', '--test', '--test-reporter=./tools/mutation-reporter.mjs', ...productTests].join(' ');
  summary('| Файл | Мест | Убито | Выжило | Вышло за предел времени | Исходные тесты, с | Время, с |\n|---|---|---|---|---|---|---|');
  process.exit(Math.max(0, ...product.map((file) => mutateFile(file, testCommand))));
}

/** @param {string} line */
function summary(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

/** @param {string} text @param {RegExp} pattern */
function count(text, pattern) {
  return (text.match(pattern) ?? []).length;
}

/**
 * Мутации одного файла и строка итогов по нему. Числа мест берутся из вывода mutator,
 * запуски тестов — из журнала, который ведёт tools/mutation-reporter.mjs.
 * @param {string} file @param {string} testCommand
 * @returns {number} код завершения mutator
 */
function mutateFile(file, testCommand) {
  const log = resolve('.metrics/mutation-runs.log');
  mkdirSync('.metrics', { recursive: true });
  rmSync(log, { force: true });
  const started = Date.now();
  const result = spawnSync('mutator', [
    '--no-coverage', '--mutate-all', '--max-workers', '2', '--test-command', testCommand, file
  ], { env: { ...process.env, MUTATION_LOG: log }, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 2 ** 28 });
  if (result.error) throw result.error;
  process.stdout.write(result.stdout);
  const runs = existsSync(log) ? readFileSync(log, 'utf8') : '';
  const killed = count(result.stdout, /^KILLED /gm);
  const survived = count(result.stdout, /^SURVIVED /gm);
  const baseline = Number(/^end (\d+)$/m.exec(runs)?.[1]) / 1000;
  const seconds = Math.round((Date.now() - started) / 1000);
  summary(`| ${file} | ${killed + survived} | ${killed} | ${survived} | ${count(runs, /^start$/gm) - count(runs, /^end /gm)} | ${baseline.toFixed(1)} | ${seconds} |`);
  return result.status ?? 1;
}

switch (command) {
  case 'test': test(); break;
  case 'check': check(); break;
  case 'coverage': coverage(); break;
  case 'mutate': mutate(); break;
  default: throw new Error(`Неизвестная проверка: ${command}`);
}
