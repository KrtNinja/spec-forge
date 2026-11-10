// @ts-check
// Действие check: проверка документов задачи. Пока — заголовки `_work/context.md`.
import { existsSync } from 'node:fs';
import { contextHeadings, texts } from './contract.mjs';
import { headings, isTask, readText, taskFile, taskName } from './docs.mjs';

/** @param {Record<string, unknown>} args @returns {import('./status.mjs').Answer} */
export function check(args) {
  const task = taskName(args);
  if (task === '') return { error: texts.noTask };
  if (!isTask(task)) return { error: texts.unknownTask(task) };
  const errors = contextErrors(taskFile(task, '_work/context.md'));
  return errors.length === 0 ? texts.noErrors : texts.errors(errors);
}

/**
 * Каждый заголовок заготовки — ровно один раз; порядок не проверяется.
 * Файла нет — изучения ещё не было, это не ошибка.
 * @param {string} file
 */
function contextErrors(file) {
  if (!existsSync(file)) return [];
  const found = headings(readText(file));
  return contextHeadings.flatMap((heading) => {
    const count = found.filter((item) => item === heading).length;
    if (count === 0) return [texts.missingHeading(file, heading)];
    return count > 1 ? [texts.repeatedHeading(file, heading)] : [];
  });
}
