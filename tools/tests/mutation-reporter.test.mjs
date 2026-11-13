import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const reporter = resolve(import.meta.dirname, '../mutation-reporter.mjs');

/**
 * Запускает тесты из files с отчётом для мутаций так же, как mutator: через оболочку,
 * в своей группе процессов. Возвращает итог запуска и журнал.
 * @param {Record<string, string>} files
 * @param {(cwd: string) => void} [inspect] проверки, которым нужна папка запуска
 */
async function runTests(files, inspect = () => {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'spec-forge-reporter-'));
  try {
    for (const [name, content] of Object.entries(files)) writeFileSync(join(cwd, name), content);
    const log = join(cwd, 'runs.log');
    /** @type {NodeJS.ProcessEnv} */
    const env = { ...process.env, MUTATION_LOG: log };
    delete env.NODE_TEST_CONTEXT;
    const command = `"${process.execPath}" --test --test-reporter="${reporter}" ${Object.keys(files).join(' ')}`;
    const child = spawn('sh', ['-c', command], { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    // Если отчёт не остановил запуск сам, группа завершается здесь, и проверки ниже падают.
    const guard = setTimeout(() => process.kill(-Number(child.pid), 'SIGKILL'), 20000);
    /** @type {Promise<[number | null, string | null]>} */
    const closed = new Promise((done) => child.on('close', (code, signal) => done([code, signal])));
    const [code, signal] = await closed;
    clearTimeout(guard);
    inspect(cwd);
    return { code, signal, stdout, log: readFileSync(log, 'utf8') };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

/**
 * Работает ли процесс (Linux). Завершённый, но ещё не убранный системой процесс не работает.
 * @param {number} pid
 */
function alive(pid) {
  try {
    return !/\) Z /.test(readFileSync(`/proc/${pid}/stat`, 'utf8'));
  } catch {
    return false;
  }
}

test('Все тесты прошли: код 0, вывода нет, в журнале начало и конец', async () => {
  const result = await runTests({ 'ok.test.mjs': 'import { test } from "node:test"; test("проходит", () => {});' });
  assert.deepEqual([result.code, result.signal], [0, null]);
  assert.equal(result.stdout, '');
  assert.match(result.log, /^start\nend \d+\n$/);
});

test('Первое падение: тест назван, запуск остановлен, процессов не осталось', async () => {
  // Тест запускает долгий процесс (как сервер), записывает его номер и падает.
  // Следующий тест оставил бы файл later.txt, но до него запуск дойти не должен.
  const failing = `
    import { test } from 'node:test';
    import { spawn } from 'node:child_process';
    import { writeFileSync } from 'node:fs';
    test('падает', () => {
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
      writeFileSync('pid.txt', String(child.pid));
      throw new Error('ожидаемое падение');
    });
    test('не должен закончиться', async () => {
      await new Promise((done) => setTimeout(done, 5000));
      writeFileSync('later.txt', '');
    });`;
  let pid = 0;
  let later = true;
  const result = await runTests({ 'fail.test.mjs': failing }, (cwd) => {
    pid = Number(readFileSync(join(cwd, 'pid.txt'), 'utf8'));
    later = existsSync(join(cwd, 'later.txt'));
  });
  assert.notEqual(result.code, 0);
  assert.equal(result.stdout, 'Упал тест: падает\nожидаемое падение\n');
  assert.match(result.log, /^start\nend \d+\n$/);
  assert.equal(later, false, 'после первого падения тесты продолжились');
  assert.equal(alive(pid), false, 'запущенный тестом процесс остался работать');
});
