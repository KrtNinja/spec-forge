// @ts-check
// Действие check: проверка документов задачи и следующие свободные номера записей.
// Ошибки — по файлам: brainstorming.md, questions.md, _work/context.md. Внутри файла сначала разделы
// в порядке образца, затем сверху вниз; внутри записи — заголовок, поля, связь с другим файлом, ссылки.
import { existsSync } from 'node:fs';
import {
  blockingValues, brainstormingHeadings, contextHeadings, decisionField, outOfScopeHeading, questionFields, questionStatuses,
  sourcesHeading, texts, tool
} from './contract.mjs';
import { blocks, headings, isTask, listedSources, part, readText, taskFile } from './docs.mjs';
import { decisionBlocks, field, nextNumber, numbersIn, questionBlocks, recordNumber } from './records.mjs';

/** @typedef {import('./docs.mjs').Block} Block */
/** @typedef {import('./records.mjs').Kind} Kind */
/**
 * Что нужно проверкам записей: записи каждого вида, их номера, номера, упомянутые в решениях
 * и в «Не входит в задачу», и разделы «Источников».
 * @typedef {{ records: Record<Kind, Block[]>, numbers: Record<Kind, string[]>, decided: string[],
 *   excluded: string[], sources: Block[] }} Scope
 */

const { stage, blocking, help, status, answer } = questionFields;

/** Допустимые значения полей вопроса; у остальных полей значение любое. */
const allowed = new Map([
  [stage, tool.inputSchema.properties.command.enum],
  [blocking, blockingValues],
  [status, Object.values(questionStatuses)]
]);

/** Обязательные поля вопроса по статусу; статуса нет или он недопустим — только сам статус. */
const required = new Map([
  [questionStatuses.open, [stage, blocking, help, status]],
  [questionStatuses.solved, [status, answer]],
  [questionStatuses.outOfScope, [status, answer]]
]);

/** Поле вызова — строка; не строка или нет поля — пусто. @param {{ task: string }} call @returns {import('./status.mjs').Answer} */
export function check({ task }) {
  if (task === '') return { error: texts.noTask };
  if (!isTask(task)) return { error: texts.unknownTask(task) };
  const files = { ideas: taskFile(task, 'brainstorming.md'), questions: taskFile(task, 'questions.md') };
  const ideas = blocks(readText(files.ideas));
  const questions = blocks(readText(files.questions));
  const scope = scopeOf(ideas, questions);
  const errors = [
    ...ideasErrors(files.ideas, ideas, scope),
    ...questions.flatMap((block) => questionsBlockErrors(files.questions, block, scope)),
    ...contextErrors(taskFile(task, '_work/context.md'))
  ];
  const next = [nextNumber('D', scope.numbers.D), nextNumber('Q', scope.numbers.Q)];
  return errors.length === 0 ? texts.noErrors(next) : texts.errors(errors, next);
}

/** @param {Block[]} ideas разделы brainstorming.md @param {Block[]} questions разделы questions.md @returns {Scope} */
function scopeOf(ideas, questions) {
  const records = { D: decisionBlocks(ideas), Q: questionBlocks(questions) };
  return {
    records,
    numbers: { D: numbers(records.D, 'D'), Q: numbers(records.Q, 'Q') },
    decided: numbersIn(records.D.flatMap((block) => block.lines)),
    excluded: numbersIn(part(ideas, outOfScopeHeading).flatMap(withHeading)),
    sources: part(ideas, sourcesHeading)
  };
}

/** Номера записей с правильным заголовком, повторы сохраняются. @param {Block[]} records @param {Kind} kind */
function numbers(records, kind) {
  return records.map((block) => recordNumber(block, kind)).filter((number) => number !== '');
}

/** @param {string} file @param {string[]} expected заголовки, каждый ровно один раз @param {string[]} found */
function headingErrors(file, expected, found) {
  return expected.flatMap((heading) => {
    const count = found.filter((item) => item === heading).length;
    if (count === 0) return [texts.missingHeading(file, heading)];
    return count > 1 ? [texts.repeatedHeading(file, heading)] : [];
  });
}

/** @param {string} file @param {Block[]} ideas @param {Scope} scope */
function ideasErrors(file, ideas, scope) {
  const sections = headingErrors(file, brainstormingHeadings, ideas.map((block) => block.heading));
  return [...sections, ...ideas.flatMap((block) => ideasBlockErrors(file, block, scope))];
}

/** Раздел brainstorming.md: решение, «Источники» с подразделами или прочий раздел. @param {string} file @param {Block} block @param {Scope} scope */
function ideasBlockErrors(file, block, scope) {
  if (scope.records.D.includes(block)) return recordErrors(file, block, 'D', scope);
  return [...sourceErrors(file, block, scope.sources), ...deadReferences(file, block, '', withHeading(block), scope)];
}

/**
 * Каждая непустая строка «Источников» — пункт, который начинается с источника: другие `status` не видит.
 * Подзаголовок внутри «Источников» — ошибка, его пункты не разбираются.
 * @param {string} file @param {Block} block @param {Block[]} sources
 */
function sourceErrors(file, block, sources) {
  if (block.heading === sourcesHeading) {
    return block.lines.filter((line) => line.trim() !== '' && listedSources([line]).length === 0)
      .map((line) => texts.badSourceLine(file, line.trim()));
  }
  return sources.includes(block) ? [texts.sourceSubheading(file, block.heading)] : [];
}

/** Раздел questions.md: первого уровня — не запись. @param {string} file @param {Block} block @param {Scope} scope */
function questionsBlockErrors(file, block, scope) {
  if (scope.records.Q.includes(block)) return recordErrors(file, block, 'Q', scope);
  return deadReferences(file, block, '', withHeading(block), scope);
}

/**
 * Запись: заголовок не номер — только эта ошибка и ссылки; иначе повтор номера, поля, ссылки.
 * @param {string} file @param {Block} block @param {Kind} kind @param {Scope} scope
 */
function recordErrors(file, block, kind, scope) {
  const number = recordNumber(block, kind);
  if (number === '') return [texts.badRecordHeading(file, block.heading, kind), ...deadReferences(file, block, '', block.lines, scope)];
  const first = scope.records[kind].find((item) => recordNumber(item, kind) === number);
  return [
    ...(first === block ? [] : [texts.repeatedNumber(file, number)]),
    ...(kind === 'D' ? decisionErrors(file, number, block) : questionErrors(file, number, block, scope)),
    ...deadReferences(file, block, number, block.lines, scope)
  ];
}

/** @param {string} file @param {string} number @param {Block} block */
function decisionErrors(file, number, block) {
  return field(block.lines, decisionField) === '' ? [texts.emptyField(file, number, decisionField)] : [];
}

/**
 * Поля в порядке образца, затем связь с brainstorming.md.
 * @param {string} file @param {string} number @param {Block} block @param {Scope} scope
 */
function questionErrors(file, number, block, scope) {
  const state = field(block.lines, status);
  const needed = required.get(state) || [status];
  return [
    ...Object.values(questionFields).flatMap((name) => {
      const value = field(block.lines, name);
      if (value === '') return needed.includes(name) ? [texts.emptyField(file, number, name)] : [];
      const options = allowed.get(name) || [value];
      return options.includes(value) ? [] : [texts.badValue(file, number, name, value, options)];
    }),
    ...linkErrors(file, number, state, scope)
  ];
}

/**
 * Решённый вопрос упомянут в записи D, вопрос «не входит» — в «Не входит в задачу».
 * @param {string} file @param {string} number @param {string} state @param {Scope} scope
 */
function linkErrors(file, number, state, scope) {
  if (state === questionStatuses.solved && !scope.decided.includes(number)) return [texts.noDecision(file, number)];
  if (state === questionStatuses.outOfScope && !scope.excluded.includes(number)) return [texts.notOutOfScope(file, number)];
  return [];
}

/** Текст раздела вне записей: номер упоминается и в заголовке. У записи заголовок — её номер. @param {Block} block */
const withHeading = (block) => [block.heading, ...block.lines];

/**
 * Упомянутые номера, которых нет среди записей: в записи — с её номером, вне записей — с заголовком раздела.
 * @param {string} file @param {Block} block @param {string} number номер записи; не запись — пусто
 * @param {string[]} lines где искать упоминания @param {Scope} scope
 */
function deadReferences(file, block, number, lines, scope) {
  const existing = [...scope.numbers.D, ...scope.numbers.Q];
  return numbersIn(lines).filter((item) => !existing.includes(item)).map((item) => (number === ''
    ? texts.deadReferenceInSection(file, block.heading, item)
    : texts.deadReferenceInRecord(file, number, item)));
}

/**
 * Каждый заголовок заготовки — ровно один раз; порядок не проверяется.
 * Файла нет — изучения ещё не было, это не ошибка.
 * @param {string} file
 */
function contextErrors(file) {
  if (!existsSync(file)) return [];
  return headingErrors(file, contextHeadings, headings(readText(file)));
}
