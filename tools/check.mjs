// @ts-check
import { execFileSync, spawnSync } from 'node:child_process';

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
function mutate() {
  const productTests = tests.filter((file) => !file.startsWith('tools/'));
  run('mutator', [
    '--no-coverage', '--mutate-all', '--max-workers', '2',
    '--test-command', ['node', '--test', ...productTests].join(' '), ...product
  ]);
}

switch (command) {
  case 'test': test(); break;
  case 'check': check(); break;
  case 'coverage': coverage(); break;
  case 'mutate': mutate(); break;
  default: throw new Error(`Неизвестная проверка: ${command}`);
}
