// @ts-check
// Действие status: выбор задачи, имя новой папки, источники и задание на их изучение.
// Пока только для sf-grill и задач без spec.md; остальные переходы — в следующих блоках.
import { existsSync } from 'node:fs';
import { failedHeading, studiedHeading, texts, tool } from './contract.mjs';
import {
  isTask, listedSources, mentionedKeys, readText, section, sourceKey, taskFile, taskName, tasks, validName
} from './docs.mjs';

/** @typedef {import('./contract.mjs').Source} Source */
/** Ответ: текст или `error` — вызов не удался. @typedef {string | { error: string }} Answer */

const commands = tool.inputSchema.properties.command.enum;

/** @param {Record<string, unknown>} args @returns {Answer} */
export function status(args) {
  const command = String(args.command);
  if (!commands.includes(command)) return { error: texts.noCommand };
  if (command !== 'sf-grill') return { error: texts.commandNotImplemented(command) };
  const task = taskName(args);
  return task === '' ? choose() : named(task);
}

/** Задача не названа: для sf-grill подходят задачи без spec.md. @returns {Answer} */
function choose() {
  const open = tasks().filter((name) => !existsSync(taskFile(name, 'spec.md')));
  if (open.length === 0) return texts.noOpenTasks;
  if (open.length > 1) return texts.chooseTask(open);
  return discussion(open[0], [texts.otherTask]);
}

/** Задача названа: существующая или имя новой папки. @param {string} name @returns {Answer} */
function named(name) {
  if (/\p{Script=Cyrillic}/u.test(name)) return texts.cyrillicName(name);
  if (!validName.test(name)) return texts.badName(name);
  if (!isTask(name)) return existsSync(`docs/${name}`) ? texts.folderTaken(name) : texts.newTask(name);
  if (existsSync(taskFile(name, 'spec.md'))) return { error: texts.stageNotImplemented(name) };
  return discussion(name, []);
}

/**
 * Задача на обсуждении: следующий шаг по её источникам, затем строки tail.
 * @param {string} task @param {string[]} tail
 */
function discussion(task, tail) {
  const sources = listedSources(section(readText(taskFile(task, 'brainstorming.md')), '## Источники'));
  const context = readText(taskFile(task, '_work/context.md'));
  return [texts.discussion(task), next(task, sources, context), ...tail].join('\n\n');
}

/**
 * Изучен источник, упомянутый в «Изучено». Среди неизученных есть недоступные — только их список;
 * иначе задание на неизученные; всё изучено — продолжить обсуждение.
 * @param {string} task @param {Source[]} sources @param {string} context текст `_work/context.md`
 */
function next(task, sources, context) {
  const studied = mentionedKeys(section(context, studiedHeading));
  const failed = mentionedKeys(section(context, failedHeading));
  const pending = sources.filter((source) => !studied.includes(sourceKey(source)));
  const unavailable = pending.flatMap((source) => problem(source, failed));
  if (unavailable.length === 0) return pending.length === 0 ? texts.continueDiscussion : texts.studyTask(task, pending);
  return texts.unavailableSources(unavailable);
}

/**
 * Почему неизученный источник недоступен: записан в «Не изучено» или пути нет. Доступен — пусто.
 * Ссылки на наличие не проверяются.
 * @param {Source} source @param {string[]} failed
 */
function problem(source, failed) {
  if (failed.includes(sourceKey(source))) return [texts.failedSource(source)];
  return 'path' in source && !existsSync(source.path) ? [texts.missingSource(source.path)] : [];
}
