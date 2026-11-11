// @ts-check
// Действие check: проверка документов задачи и следующие свободные номера записей.
// Ошибки — по файлам: brainstorming.md, questions.md, spec.md, _work/context.md. Внутри файла сначала разделы
// в порядке образца, у spec.md затем строка статуса, дальше сверху вниз; внутри записи — заголовок, поля
// в порядке образца, связь с другим файлом, упоминания номеров, ссылки Markdown.
import { existsSync } from 'node:fs';
import {
  blockingValues, brainstormingHeadings, contextHeadings, decisionField, questionFields, questionStatuses, replacedField,
  requirementFields, sourcesHeading, specHeadings, texts, tool
} from './contract.mjs';
import { headings, listedSources, readText, taskFile, taskProblem } from './docs.mjs';
import { linkErrors } from './links.mjs';
import { field, fieldValues, numbersIn, recordNumber } from './records.mjs';
import { specNotes, statusErrors } from './spec.mjs';
import { nextNumbers, placeOf, readDocs, scopeOf, withHeading } from './task.mjs';

/** @typedef {import('./docs.mjs').Block} Block */
/** @typedef {import('./task.mjs').Doc} Doc */
/** @typedef {import('./task.mjs').Scope} Scope */
/** @typedef {import('./records.mjs').Kind} Kind */

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
  const problem = taskProblem(task);
  if (problem !== '') return { error: problem };
  const { errors, scope } = inspect(task);
  const next = nextNumbers(scope);
  const summary = errors.length === 0 ? texts.noErrors(next) : texts.errors(errors, next);
  return [summary, ...specNotes(scope, errors.length === 0)].join('\n\n');
}

/** Ошибки всех документов существующей задачи и разобранные документы. @param {string} task */
export function inspect(task) {
  const scope = scopeOf(readDocs(task));
  const { ideas, questions, spec } = scope.docs;
  const errors = [
    ...headingErrors(ideas.path, brainstormingHeadings, ideas.blocks.map((block) => block.heading)),
    ...ideas.blocks.flatMap((block) => ideasBlockErrors(ideas.path, block, scope)),
    ...questions.blocks.flatMap((block) => blockErrors(questions, 'Q', block, scope)),
    ...specErrors(spec, scope),
    ...contextErrors(taskFile(task, '_work/context.md'))
  ];
  return { errors, scope };
}

/** @param {string} file @param {string[]} expected заголовки, каждый ровно один раз @param {string[]} found */
function headingErrors(file, expected, found) {
  return expected.flatMap((heading) => {
    const count = found.filter((item) => item === heading).length;
    if (count === 0) return [texts.missingHeading(file, heading)];
    return count > 1 ? [texts.repeatedHeading(file, heading)] : [];
  });
}

/** Раздел brainstorming.md: «Источники» и их подразделы проверяются ещё и на источники. @param {string} file @param {Block} block @param {Scope} scope */
function ideasBlockErrors(file, block, scope) {
  return [...sourceErrors(file, block, scope.sources), ...blockErrors(scope.docs.ideas, 'D', block, scope)];
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

/** spec.md, если он есть: разделы, строка статуса, затем разделы сверху вниз. @param {Doc} spec @param {Scope} scope */
function specErrors(spec, scope) {
  if (!spec.exists) return [];
  return [
    ...headingErrors(spec.path, specHeadings, spec.blocks.map((block) => block.heading)),
    ...statusErrors(spec.path, spec.text),
    ...spec.blocks.flatMap((block) => blockErrors(spec, 'FR', block, scope))
  ];
}

/**
 * Раздел документа: запись своего вида или раздел вне записей — упоминания номеров и ссылки, в том числе в заголовке.
 * @param {Doc} doc @param {Kind} kind вид записей документа @param {Block} block @param {Scope} scope
 */
function blockErrors(doc, kind, block, scope) {
  if (scope.records[kind].includes(block)) return recordErrors(doc.path, block, kind, scope);
  return references(doc.path, block.heading, withHeading(block), scope);
}

/**
 * Запись: заголовок не номер — только эта ошибка и ссылки; иначе повтор номера, поля, ссылки.
 * @param {string} file @param {Block} block @param {Kind} kind @param {Scope} scope
 */
function recordErrors(file, block, kind, scope) {
  const number = recordNumber(block, kind);
  const place = placeOf(scope, kind, block);
  if (number === '') return [texts.badRecordHeading(file, block.heading, kind), ...references(file, place, block.lines, scope)];
  const first = scope.records[kind].find((item) => recordNumber(item, kind) === number);
  return [
    ...(first === block ? [] : [texts.repeatedNumber(file, number)]),
    ...fieldsOf[kind](file, number, block, scope),
    ...references(file, place, block.lines, scope)
  ];
}

/** Поля записи каждого вида и связь с другим файлом. @type {Record<Kind, (file: string, number: string, block: Block, scope: Scope) => string[]>} */
const fieldsOf = {
  D: (file, number, block) => [decisionField, replacedField].flatMap((name) => fieldErrors(file, number, block.lines, name, [decisionField])),
  Q: questionErrors,
  FR: requirementErrors
};

/**
 * Поля в порядке образца, затем связь с brainstorming.md. Статус повторяется — как недопустимый.
 * @param {string} file @param {string} number @param {Block} block @param {Scope} scope
 */
function questionErrors(file, number, block, scope) {
  const state = field(block.lines, status);
  const needed = required.get(state) || [status];
  return [
    ...Object.values(questionFields).flatMap((name) => fieldErrors(file, number, block.lines, name, needed)),
    ...decisionLinkErrors(file, number, state, scope)
  ];
}

/**
 * Оба поля обязательны; в заполненном «Основании» — номер решения D, и ни одно названное решение не заменено.
 * @param {string} file @param {string} number @param {Block} block @param {Scope} scope
 */
function requirementErrors(file, number, block, scope) {
  const names = Object.values(requirementFields);
  const basis = field(block.lines, requirementFields.basis);
  const decisions = numbersIn([basis]).filter((item) => item.startsWith('D-'));
  return [
    ...names.flatMap((name) => fieldErrors(file, number, block.lines, name, names)),
    ...(basis !== '' && decisions.length === 0 ? [texts.noBasisDecision(file, number)] : []),
    ...decisions.filter((item) => scope.replaced.includes(item)).map((item) => texts.replacedBasis(file, number, item))
  ];
}

/**
 * Поле повторяется — только эта ошибка; пустое — ошибка, если оно обязательно; иначе допустимое ли значение.
 * @param {string} file @param {string} number @param {string[]} lines @param {string} name @param {string[]} needed обязательные поля
 */
function fieldErrors(file, number, lines, name, needed) {
  if (fieldValues(lines, name).length > 1) return [texts.repeatedField(file, number, name)];
  const value = field(lines, name);
  if (value === '') return needed.includes(name) ? [texts.emptyField(file, number, name)] : [];
  const options = allowed.get(name) || [value];
  return options.includes(value) ? [] : [texts.badValue(file, number, name, value, options)];
}

/**
 * Решённый вопрос упомянут в записи D, вопрос «не входит» — в «Не входит в задачу».
 * @param {string} file @param {string} number @param {string} state @param {Scope} scope
 */
function decisionLinkErrors(file, number, state, scope) {
  if (state === questionStatuses.solved && !scope.decided.includes(number)) return [texts.noDecision(file, number)];
  if (state === questionStatuses.outOfScope && !scope.excluded.includes(number)) return [texts.notOutOfScope(file, number)];
  return [];
}

/**
 * Упомянутые номера, которых нет среди записей, затем ссылки Markdown.
 * @param {string} file @param {string} place номер записи или заголовок раздела @param {string[]} lines @param {Scope} scope
 */
function references(file, place, lines, scope) {
  const existing = Object.values(scope.numbers).flat();
  return [
    ...numbersIn(lines).filter((item) => !existing.includes(item)).map((item) => texts.deadReference(file, place, item)),
    ...linkErrors(scope, file, place, lines)
  ];
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
