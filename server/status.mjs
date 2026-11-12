// @ts-check
// Действие status: выбор задачи, имя новой папки, источники и задание на их изучение,
// блокирующие вопросы, переход к требованиям, путь проверки, замечания проверки, состояние требований и одобрения.
// Для sf-grill, sf-spec, sf-review и sf-note; sf-note отвечает как команда этапа задачи.
import { existsSync } from 'node:fs';
import { failedHeading, sourcesHeading, studiedHeading, tool } from './contract.mjs';
import { texts } from './texts.mjs';
import { inspect } from './check.mjs';
import {
  blocks, isTask, listedSources, mentionedKeys, readText, section, sourceKey, taskFile, tasks, validName
} from './docs.mjs';
import { headingNumbers, isBlocking, questionBlocks } from './records.mjs';
import { approvalOf, isApproved } from './spec.mjs';
import { openQuestions, remarksOf } from './task.mjs';

/** @typedef {import('./contract.mjs').Source} Source */
/** Ответ: текст или `error` — вызов не удался. @typedef {string | { error: string }} Answer */
/** Следующий шаг: текст и строка Tip, если открыт переход. @typedef {{ text: string, tip: string[] }} Step */
/** Признаки пути проверки от модели; не логическое значение — признака нет. @typedef {{ touched?: boolean, agent?: boolean }} Flags */
/**
 * Путь проверки: как он назван в строке и что идёт в конце ответа — задание или строка Tip.
 * @typedef {{ text: string, tail: string[] }} Way
 */
/**
 * Как команда предлагает проверку: строка, пока проверки ИИ не было, и путь у варианта «Повторить проверку».
 * @typedef {{ start: (open: string[]) => string, way: Way }} Offer
 */

const commands = tool.inputSchema.properties.command.enum;

/**
 * Поля command и task — строки; не строка или нет поля — пусто. Признаки — для sf-review.
 * @param {{ command: string, task: string } & Flags} call @returns {Answer}
 */
export function status({ command, task, touched, agent }) {
  if (!commands.includes(command)) return { error: texts.noCommand };
  if (command === 'sf-grill') return task === '' ? choose() : named(task);
  if (command === 'sf-spec') return task === '' ? chooseSpec() : namedSpec(task);
  if (command === 'sf-review') return review(task, { touched, agent });
  return task === '' ? chooseNote() : namedNote(task);
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
 * sf-spec: пока проверки не было — проверить (рекомендуется) или одобрить; путь — команда /sf-review, путь выберет он.
 * @param {string} task @returns {Offer}
 */
const specOffer = (task) => ({
  start: (open) => texts.specReady(task, open),
  way: { text: texts.reviewCommand(task), tail: [] }
});

/**
 * Требования в spec.md: ошибки проверки — исправить; одобрено — строка одобренной задачи; блокирующие замечания
 * без решения — разбор по одному; иначе шаг с путём проверки, затем задание или строка Tip этого пути.
 * @param {string} task @param {Offer} offer @returns {Answer}
 */
function requirements(task, offer = specOffer(task)) {
  const { errors, scope } = inspect(task);
  if (errors.length > 0) return texts.specErrors(task);
  const open = openQuestions(scope);
  const remarks = remarksOf(scope);
  const sums = approvalOf(scope.docs.spec.text);
  if (sums.approved !== '') return approvedStage(task, open, remarks.hindering, sums);
  if (remarks.blocking.length > 0) return texts.remarksBlocking(task, remarks.blocking);
  return [reviewStep(task, scope.docs.review.exists, offer, open, remarks), ...offer.way.tail].join('\n\n');
}

/**
 * Одобренная задача: все команды отвечают одинаково, без строки Tip. Препятствия — в порядке таблицы переходов:
 * блокирующие замечания последнего раздела проверки без решения или отложенные, открытые вопросы, затем сумма.
 * @param {string} task @param {string[]} open открытые вопросы @param {string[]} hindering блокирующие замечания
 * @param {ReturnType<typeof approvalOf>} sums
 */
function approvedStage(task, open, hindering, { approved, actual }) {
  if (hindering.length > 0) return texts.approvedRemarks(task, hindering);
  if (open.length > 0) return texts.approvedQuestions(task, open);
  return approved === actual ? texts.specApproved(task) : texts.approvedChanged(task);
}

/**
 * Строка с путём проверки: проверки ИИ не было — начало проверки; иначе по последнему разделу review.md —
 * замечания без решения или всё разобрано. Отложенные блокирующие замечания мешают одобрению (FR-19, FR-20).
 * @param {string} task @param {boolean} reviewed @param {Offer} offer @param {string[]} open открытые вопросы
 * @param {ReturnType<typeof remarksOf>} remarks
 */
function reviewStep(task, reviewed, offer, open, { undecided, hindering }) {
  if (!reviewed) return offer.start(open);
  if (undecided.length > 0) return texts.remarksOpen(task, undecided, offer.way.text, open, hindering);
  return texts.reviewDone(task, offer.way.text, open, hindering);
}

/**
 * sf-review: без обоих признаков путь проверки не выбрать. Задача названа — новую не начинает,
 * без spec.md проверять нечего — к sf-spec.
 * @param {string} task @param {Flags} flags @returns {Answer}
 */
function review(task, flags) {
  if ([flags.touched, flags.agent].includes(undefined)) return { error: texts.noReviewFlags };
  if (task === '') return chooseReview(flags);
  if (!isTask(task)) return texts.noSuchTask(task);
  if (!hasSpec(task)) return [texts.noSpecYet(task), texts.tip(`/sf-spec ${task}`)].join('\n\n');
  return requirements(task, reviewOffer(task, flags));
}

/** Задача не названа: для sf-review подходят задачи со spec.md, ещё не одобренные. @param {Flags} flags @returns {Answer} */
function chooseReview(flags) {
  const open = tasks().filter((name) => hasSpec(name) && !approved(name));
  if (open.length === 0) return texts.noReviewTasks;
  return open.length > 1 ? texts.chooseReviewTask(open) : requirements(open[0], reviewOffer(open[0], flags));
}

/**
 * sf-review: пока проверки не было — проверить по пути: проверку пользователь уже выбрал.
 * @param {string} task @param {Flags} flags @returns {Offer}
 */
function reviewOffer(task, flags) {
  const way = wayOf(task, flags);
  return { start: () => texts.reviewStart(task, way.text), way };
}

/** Задача не названа: для sf-note подходит любая задача, включая одобренные. @returns {Answer} */
function chooseNote() {
  const all = tasks();
  if (all.length === 0) return texts.noTasks;
  return all.length > 1 ? texts.chooseAnyTask(all) : noteStage(all[0]);
}

/** Задача названа: sf-note новую задачу не начинает. @param {string} name @returns {Answer} */
function namedNote(name) {
  return isTask(name) ? noteStage(name) : texts.noSuchTask(name);
}

/**
 * sf-note отвечает как команда этапа задачи: со spec.md — как sf-spec, без него — как sf-grill,
 * но без строки о другой задаче: её начинает только sf-grill.
 * @param {string} task @returns {Answer}
 */
function noteStage(task) {
  return hasSpec(task) ? requirements(task) : discussion(task, []);
}

/**
 * Путь проверки — «сначала чистый контекст»: spec.md в этой сессии не трогали — здесь, даже если отдельный агент
 * есть; трогали — отдельным агентом по заданию, а без него — только новая сессия со строкой Tip (FR-17).
 * @param {string} task @param {Flags} flags @returns {Way}
 */
function wayOf(task, { touched, agent }) {
  if (!touched) return { text: texts.reviewHere, tail: [] };
  if (agent) return { text: texts.reviewByAgent, tail: [texts.reviewTask(task)] };
  return { text: texts.reviewInNewSession(task), tail: [texts.tip(`/sf-review ${task}`)] };
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
  return headingNumbers(questionBlocks(blocks(readText(taskFile(task, 'questions.md')))).filter(isBlocking));
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
