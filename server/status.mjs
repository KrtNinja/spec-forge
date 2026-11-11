// @ts-check
// Действие status: выбор задачи, имя новой папки, источники и задание на их изучение,
// блокирующие вопросы, переход к требованиям, состояние требований и одобрения.
// Для sf-grill и sf-spec; sf-review и sf-note — в следующих блоках.
import { existsSync } from 'node:fs';
import { failedHeading, sourcesHeading, studiedHeading, texts, tool } from './contract.mjs';
import { inspect } from './check.mjs';
import {
  blocks, isTask, listedSources, mentionedKeys, readText, section, sourceKey, taskFile, tasks, validName
} from './docs.mjs';
import { isBlocking, questionBlocks, questionNumbers } from './records.mjs';
import { approvalOf, isApproved } from './spec.mjs';
import { openQuestions } from './task.mjs';

/** @typedef {import('./contract.mjs').Source} Source */
/** Ответ: текст или `error` — вызов не удался. @typedef {string | { error: string }} Answer */
/** Следующий шаг: текст и строка Tip, если открыт переход. @typedef {{ text: string, tip: string[] }} Step */

const commands = tool.inputSchema.properties.command.enum;

/** Поля вызова — строки; не строка или нет поля — пусто. @param {{ command: string, task: string }} call @returns {Answer} */
export function status({ command, task }) {
  if (!commands.includes(command)) return { error: texts.noCommand };
  if (command === 'sf-grill') return task === '' ? choose() : named(task);
  if (command === 'sf-spec') return task === '' ? chooseSpec() : namedSpec(task);
  return { error: texts.commandNotImplemented(command) };
}

/** @param {string} task */
const hasSpec = (task) => existsSync(taskFile(task, 'spec.md'));

/** Задача одобрена: в spec.md строка одобрения; нет spec.md — не одобрена. @param {string} task */
const approved = (task) => isApproved(readText(taskFile(task, 'spec.md')));

/** Задача не названа: для sf-grill подходят задачи без spec.md. @returns {Answer} */
function choose() {
  const open = tasks().filter((name) => !hasSpec(name));
  if (open.length === 0) return texts.noOpenTasks;
  if (open.length > 1) return texts.chooseTask(open);
  return discussion(open[0], [texts.otherTask]);
}

/**
 * Задача названа: существующая или имя новой папки. Со spec.md — одобренная отвечает как для sf-spec,
 * неодобренная отправляет к sf-spec.
 * @param {string} name @returns {Answer}
 */
function named(name) {
  if (/\p{Script=Cyrillic}/u.test(name)) return texts.cyrillicName(name);
  if (!validName.test(name)) return texts.badName(name);
  if (!isTask(name)) return existsSync(`docs/${name}`) ? texts.folderTaken(name) : texts.newTask(name);
  if (approved(name)) return requirements(name);
  if (hasSpec(name)) return [texts.discussionDone(name), texts.tip(`/sf-spec ${name}`)].join('\n\n');
  return discussion(name, []);
}

/** Задача не названа: для sf-spec подходят задачи, ещё не одобренные. @returns {Answer} */
function chooseSpec() {
  const open = tasks().filter((name) => !approved(name));
  if (open.length === 0) return texts.noSpecTasks;
  return open.length > 1 ? texts.chooseSpecTask(open) : specStage(open[0]);
}

/** Задача названа: sf-spec новую задачу не начинает. @param {string} name @returns {Answer} */
function namedSpec(name) {
  return isTask(name) ? specStage(name) : texts.noSuchTask(name);
}

/**
 * spec.md нет: обсуждение не закончено — назад к sf-grill, иначе подготовить требования.
 * @param {string} task @returns {Answer}
 */
function specStage(task) {
  if (hasSpec(task)) return requirements(task);
  const { pending } = sourcesOf(task);
  const blocking = blockingQuestions(task);
  if (pending.length === 0 && blocking.length === 0) return texts.writeSpec(task);
  const reason = pending.length === 0 ? texts.blockedBy(blocking) : texts.sourcesPending;
  return [texts.tooEarly(task, reason), texts.tip(`/sf-grill ${task}`)].join('\n\n');
}

/**
 * Требования в spec.md: ошибки проверки — исправить; одобрено — завершено, если сумма совпадает и вопросов нет;
 * иначе проверка ИИ или одобрение.
 * @param {string} task @returns {Answer}
 */
function requirements(task) {
  const { errors, scope } = inspect(task);
  if (errors.length > 0) return texts.specErrors(task);
  const open = openQuestions(scope);
  const sums = approvalOf(scope.docs.spec.text);
  if (sums.approved === '') return open.length > 0 ? texts.specOpenQuestions(task, open) : texts.specReady(task);
  return open.length > 0 || sums.approved !== sums.actual ? { error: texts.stageNotImplemented(task) } : texts.specApproved(task);
}

/**
 * Задача на обсуждении: следующий шаг, затем строки tail. Строка Tip — последней, только с переходом.
 * @param {string} task @param {string[]} tail
 */
function discussion(task, tail) {
  const step = next(task);
  return [texts.discussion(task), step.text, ...tail, ...step.tip].join('\n\n');
}

/**
 * Неизученные источники и недоступные среди них. Изучен источник, упомянутый в «Изучено».
 * @param {string} task
 */
function sourcesOf(task) {
  const sources = listedSources(section(readText(taskFile(task, 'brainstorming.md')), sourcesHeading));
  const context = readText(taskFile(task, '_work/context.md'));
  const studied = mentionedKeys(section(context, studiedHeading));
  const failed = mentionedKeys(section(context, failedHeading));
  const pending = sources.filter((source) => !studied.includes(sourceKey(source)));
  return { pending, unavailable: pending.flatMap((source) => problem(source, failed)) };
}

/** Блокирующие вопросы в порядке записей. @param {string} task */
function blockingQuestions(task) {
  return questionNumbers(questionBlocks(blocks(readText(taskFile(task, 'questions.md')))).filter(isBlocking));
}

/**
 * Среди неизученных источников есть недоступные — только их список; иначе задание на неизученные;
 * всё изучено — блокирующие вопросы или переход к требованиям.
 * @param {string} task @returns {Step}
 */
function next(task) {
  const { pending, unavailable } = sourcesOf(task);
  if (unavailable.length !== 0) return { text: texts.unavailableSources(unavailable), tip: [] };
  if (pending.length !== 0) return { text: texts.studyTask(task, pending), tip: [] };
  const blocking = blockingQuestions(task);
  if (blocking.length === 0) return { text: texts.readyForSpec(task), tip: [texts.tip(`/sf-spec ${task}`)] };
  return { text: texts.blockingQuestions(blocking), tip: [] };
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
