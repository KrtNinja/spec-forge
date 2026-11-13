// @ts-check
// Отчёт тестов для мутационного прогона: `node --test --test-reporter=./tools/mutation-reporter.mjs`.
// Печатает только упавшие тесты и отмечает начало и конец запуска в журнале MUTATION_LOG:
// запуск с началом, но без конца — это запуск, который mutator оборвал по пределу времени.
import { appendFileSync } from 'node:fs';

const log = process.env.MUTATION_LOG;
const started = Date.now();

/** @param {string} line */
function record(line) {
  if (log) appendFileSync(log, `${line}\n`);
}

record('start');

/** @param {AsyncIterable<{ type: string, data: any }>} events */
export default async function* report(events) {
  for await (const event of events) {
    if (event.type !== 'test:fail') continue;
    const error = event.data.details?.error;
    yield `Упал тест: ${event.data.name}\n${error?.cause?.message ?? error?.message ?? ''}\n`;
  }
  record(`end ${Date.now() - started}`);
}
