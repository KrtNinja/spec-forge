// @ts-check
// Действие status: выбор задачи, имя новой папки, источники и задание на их изучение,
// блокирующие вопросы и переход к требованиям.
// Пока только для sf-grill и задач без spec.md; остальные переходы — в следующих блоках.
import { existsSync } from 'node:fs';
import { failedHeading, sourcesHeading, studiedHeading, texts, tool } from './contract.mjs';
import {
  blocks, isTask, listedSources, mentionedKeys, readText, section, sourceKey, taskFile, tasks, validName
} from './docs.mjs';
import { isBlocking, questionBlocks } from './records.mjs';

/** @typedef {import('./contract.mjs').Source} Source */
/** Ответ: текст или `error` — вызов не удался. @typedef {string | { error: string }} Answer */
/** Следующий шаг: текст и строка Tip, если открыт переход. @typedef {{ text: string, tip: string[] }} Step */

const commands = tool.inputSchema.properties.command.enum;

/** Поля вызова — строки; не строка или нет поля — пусто. @param {{ command: string, task: string }} call @returns {Answer} */
export function status({ command, task }) {
  if (!commands.includes(command)) return { error: texts.noCommand };
  if (command !== 'sf-grill') return { error: texts.commandNotImplemented(command) };
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
 * Задача на обсуждении: следующий шаг, затем строки tail. Строка Tip — последней, только с переходом.
 * @param {string} task @param {string[]} tail
 */
function discussion(task, tail) {
  const sources = listedSources(section(readText(taskFile(task, 'brainstorming.md')), sourcesHeading));
  const context = readText(taskFile(task, '_work/context.md'));
  const step = next(task, sources, context);
  return [texts.discussion(task), step.text, ...tail, ...step.tip].join('\n\n');
}

/**
 * Изучен источник, упомянутый в «Изучено». Среди неизученных есть недоступные — только их список;
 * иначе задание на неизученные; всё изучено — вопросы.
 * @param {string} task @param {Source[]} sources @param {string} context текст `_work/context.md`
 * @returns {Step}
 */
function next(task, sources, context) {
  const studied = mentionedKeys(section(context, studiedHeading));
  const failed = mentionedKeys(section(context, failedHeading));
  const pending = sources.filter((source) => !studied.includes(sourceKey(source)));
  const unavailable = pending.flatMap((source) => problem(source, failed));
  if (unavailable.length !== 0) return { text: texts.unavailableSources(unavailable), tip: [] };
  return pending.length === 0 ? questions(task) : { text: texts.studyTask(task, pending), tip: [] };
}

/**
 * Блокирующие вопросы в порядке записей; нет их — переход к требованиям.
 * @param {string} task @returns {Step}
 */
function questions(task) {
  const blocking = questionBlocks(blocks(readText(taskFile(task, 'questions.md')))).filter(isBlocking);
  if (blocking.length === 0) return { text: texts.readyForSpec(task), tip: [texts.tip(`/sf-spec ${task}`)] };
  return { text: texts.blockingQuestions(blocking.map((block) => block.heading.replace(/^#+ /, ''))), tip: [] };
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
