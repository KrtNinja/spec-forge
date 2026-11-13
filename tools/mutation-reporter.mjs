// @ts-check
// Отчёт тестов для мутационного прогона: `node --test --test-reporter=./tools/mutation-reporter.mjs`.
// Мутация убита первым упавшим тестом, остальные ничего не добавляют: после первого падения
// отчёт печатает его и завершает всю группу процессов запуска — тесты, запущенные ими серверы
// и оболочку, в которой mutator выполняет команду. Свою группу процессов команде даёт mutator.
// Начало и конец запуска отмечаются в журнале MUTATION_LOG: запуск с началом, но без конца —
// это запуск, который mutator оборвал по пределу времени.
import { appendFileSync, writeSync } from 'node:fs';
import { Transform } from 'node:stream';

const log = process.env.MUTATION_LOG;
const started = Date.now();

/** @param {string} line */
function record(line) {
  if (log) appendFileSync(log, `${line}\n`);
}

record('start');

export default new Transform({
  writableObjectMode: true,
  transform(event, _encoding, done) {
    if (event.type === 'test:fail') {
      const error = event.data.details?.error;
      // Запись сразу, без очереди потока: следующей строкой процесс завершится.
      writeSync(1, `Упал тест: ${event.data.name}\n${error?.cause?.message ?? error?.message ?? ''}\n`);
      record(`end ${Date.now() - started}`);
      process.kill(0, 'SIGKILL');
    }
    done();
  },
  flush(done) {
    record(`end ${Date.now() - started}`);
    done();
  }
});
