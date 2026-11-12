// @ts-check
// Действие check: проверка документов задачи и следующие свободные номера записей.
// Ошибки — по файлам: brainstorming.md, questions.md, spec.md, _work/review.md, _work/context.md. Внутри файла
// сначала разделы в порядке образца, у spec.md затем строка статуса, дальше сверху вниз; внутри записи — заголовок,
// поля в порядке образца, связь с другим файлом, упоминания номеров, ссылки Markdown.
import { existsSync } from 'node:fs';
import {
  blockingValues, brainstormingHeadings, contextHeadings, decisionField, questionFields, questionStatuses, remarkDecisions,
  remarkFields, remarkImportance, replacedField, requirementFields, sourcesHeading, specHeadings, tool
} from './contract.mjs';
import { texts } from './texts.mjs';
import { headings, listedSources, readText, taskFile, taskProblem } from './docs.mjs';
import { linkErrors } from './links.mjs';
import { field, fieldValues, kindOf, numbersIn, recordNumber } from './records.mjs';
import { specNotes, statusErrors } from './spec.mjs';
import { nextNumbers, placeOf, readDocs, scopeOf, withHeading } from './task.mjs';

/** @typedef {import('./docs.mjs').Block} Block */
/** @typedef {import('./task.mjs').Doc} Doc */
/** @typedef {import('./task.mjs').Scope} Scope */
/** @typedef {import('./records.mjs').Kind} Kind */
/**
 * Запись, у которой проверяются поля: файл, номер, вид и строки под заголовком.
 * @typedef {{ file: string, number: string, kind: Kind, lines: string[] }} Entry
 */

const { stage, blocking, help, status, answer } = questionFields;

/**
 * Допустимые значения полей по видам записей; у остальных полей значение любое. По виду, а не по имени поля:
 * «Решение» есть и у решения D, и у замечания R. @type {Record<Kind, Map<string, string[]>>}
 */
const allowed = {
  D: new Map(),
  Q: new Map([
    [stage, tool.inputSchema.properties.command.enum],
    [blocking, blockingValues],
    [status, Object.values(questionStatuses)]
  ]),
  FR: new Map(),
  R: new Map([
    [remarkFields.importance, Object.values(remarkImportance)],
    [remarkFields.decision, Object.values(remarkDecisions)]
  ])
};

/** Обязательные поля замечания: все, кроме «Решения» — его даёт пользователь при разборе. */
const remarkRequired = Object.values(remarkFields).filter((name) => name !== remarkFields.decision);

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
  const { ideas, questions, spec, review } = scope.docs;
  const errors = [
    ...headingErrors(ideas.path, brainstormingHeadings, ideas.blocks.map((block) => block.heading)),
    ...ideas.blocks.flatMap((block) => ideasBlockErrors(ideas.path, block, scope)),
    ...questions.blocks.flatMap((block) => blockErrors(questions, 'Q', block, scope)),
    ...specErrors(spec, scope),
    // Обязательных заголовков у _work/review.md нет; файла нет — разделов нет.
    ...review.blocks.flatMap((block) => blockErrors(review, 'R', block, scope)),
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
    ...fieldsOf[kind]({ file, number, kind, lines: block.lines }, scope),
    ...references(file, place, block.lines, scope)
  ];
}

/** Поля записи каждого вида и связь с другим файлом. @type {Record<Kind, (entry: Entry, scope: Scope) => string[]>} */
const fieldsOf = {
  D: (entry) => fieldsErrors(entry, [decisionField, replacedField], [decisionField]),
  Q: questionErrors,
  FR: requirementErrors,
  R: remarkErrors
};

/**
 * Поля в порядке образца, затем связь с brainstorming.md. Статус повторяется — как недопустимый.
 * @param {Entry} entry @param {Scope} scope
 */
function questionErrors(entry, scope) {
  const state = field(entry.lines, status);
  return [
    ...fieldsErrors(entry, Object.values(questionFields), required.get(state) || [status]),
    ...decisionLinkErrors(entry.file, entry.number, state, scope)
  ];
}

/**
 * Оба поля обязательны; в заполненном «Основании» — номер решения D, и ни одно названное решение не заменено.
 * @param {Entry} entry @param {Scope} scope
 */
function requirementErrors(entry, scope) {
  const { file, number } = entry;
  const names = Object.values(requirementFields);
  const basis = field(entry.lines, requirementFields.basis);
  const decisions = numbersIn([basis]).filter((item) => item.startsWith('D-'));
  return [
    ...fieldsErrors(entry, names, names),
    ...(basis !== '' && decisions.length === 0 ? [texts.noBasisDecision(file, number)] : []),
    ...decisions.filter((item) => scope.replaced.includes(item)).map((item) => texts.replacedBasis(file, number, item))
  ];
}

/**
 * Поля в порядке образца, затем связь с questions.md: номер отложенного замечания упомянут в вопросе (FR-19).
 * @param {Entry} entry @param {Scope} scope
 */
function remarkErrors(entry, scope) {
  const { file, number } = entry;
  const postponed = field(entry.lines, remarkFields.decision) === remarkDecisions.postponed;
  return [
    ...fieldsErrors(entry, Object.values(remarkFields), remarkRequired),
    ...(postponed && !scope.asked.includes(number) ? [texts.noQuestion(file, number)] : [])
  ];
}

/** Поля записи в порядке образца. @param {Entry} entry @param {string[]} names @param {string[]} needed обязательные поля */
function fieldsErrors(entry, names, needed) {
  return names.flatMap((name) => fieldErrors(entry, name, needed));
}

/**
 * Поле повторяется — только эта ошибка; пустое — ошибка, если оно обязательно; иначе допустимое ли значение.
 * @param {Entry} entry @param {string} name @param {string[]} needed обязательные поля
 */
function fieldErrors(entry, name, needed) {
  const { file, number, lines } = entry;
  if (fieldValues(lines, name).length > 1) return [texts.repeatedField(file, number, name)];
  const value = field(lines, name);
  if (value === '') return needed.includes(name) ? [texts.emptyField(file, number, name)] : [];
  const options = allowed[entry.kind].get(name) || [value];
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
  return [
    ...missingNumbers(file, lines, scope).map((item) => texts.deadReference(file, place, item)),
    ...linkErrors(scope, file, place, lines)
  ];
}

/**
 * Упомянутые номера, которых нет среди записей. В _work/review.md номер FR не проверяется: прежние разделы
 * не правятся, а требование могли удалить по принятому замечанию.
 * @param {string} file @param {string[]} lines @param {Scope} scope
 */
function missingNumbers(file, lines, scope) {
  const existing = Object.values(scope.numbers).flat();
  const unchecked = file === scope.docs.review.path ? ['FR'] : [];
  return numbersIn(lines).filter((item) => !existing.includes(item) && !unchecked.includes(kindOf(item)));
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
