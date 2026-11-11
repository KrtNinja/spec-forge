// @ts-check
// Документы задачи и записи в них — общее для check, link и status. Записи D лежат в brainstorming.md,
// Q — в questions.md, FR — в spec.md; все три документа читаются сразу, до любых проверок и правок.
import { existsSync } from 'node:fs';
import { outOfScopeHeading, replacedField, sourcesHeading } from './contract.mjs';
import { blocks, part, readText, taskFile } from './docs.mjs';
import {
  decisionBlocks, fieldValues, isOpen, kindOf, nextNumber, numbersIn, questionBlocks, questionNumbers, recordNumber,
  requirementBlocks
} from './records.mjs';

/** @typedef {import('./docs.mjs').Block} Block */
/** @typedef {import('./records.mjs').Kind} Kind */
/** Документ задачи: путь от корня проекта, есть ли он, текст и разделы. @typedef {{ path: string, exists: boolean, text: string, blocks: Block[] }} Doc */
/** @typedef {{ ideas: Doc, questions: Doc, spec: Doc }} Docs */
/**
 * Что нужно проверкам и ссылкам: документы, записи каждого вида и их номера, заменённые решения,
 * номера, упомянутые в решениях и в «Не входит в задачу», и разделы «Источников».
 * @typedef {{ docs: Docs, records: Record<Kind, Block[]>, numbers: Record<Kind, string[]>, replaced: string[],
 *   decided: string[], excluded: string[], sources: Block[] }} Scope
 */

/** Документ с записями каждого вида. @type {Record<Kind, keyof Docs>} */
const homes = { D: 'ideas', Q: 'questions', FR: 'spec' };

/** @param {string} task @param {string} name */
function readDoc(task, name) {
  const path = taskFile(task, name);
  const text = readText(path);
  return { path, exists: existsSync(path), text, blocks: blocks(text) };
}

/** Документы задачи; не читается хоть один — Unreadable, до любых правок. @param {string} task @returns {Docs} */
export function readDocs(task) {
  return { ideas: readDoc(task, 'brainstorming.md'), questions: readDoc(task, 'questions.md'), spec: readDoc(task, 'spec.md') };
}

/** Номера записей с правильным заголовком, повторы сохраняются. @param {Block[]} records @param {Kind} kind */
function numbers(records, kind) {
  return records.map((block) => recordNumber(block, kind)).filter((number) => number !== '');
}

/** Текст раздела вне записей: номер упоминается и в заголовке. У записи заголовок — её номер. @param {Block} block */
export const withHeading = (block) => [block.heading, ...block.lines];

/** @param {Docs} docs @returns {Scope} */
export function scopeOf(docs) {
  const records = {
    D: decisionBlocks(docs.ideas.blocks), Q: questionBlocks(docs.questions.blocks), FR: requirementBlocks(docs.spec.blocks)
  };
  return {
    docs,
    records,
    numbers: { D: numbers(records.D, 'D'), Q: numbers(records.Q, 'Q'), FR: numbers(records.FR, 'FR') },
    replaced: records.D.filter((block) => fieldValues(block.lines, replacedField).some((value) => value !== ''))
      .map((block) => recordNumber(block, 'D')),
    decided: numbersIn(records.D.flatMap((block) => block.lines)),
    excluded: numbersIn(part(docs.ideas.blocks, outOfScopeHeading).flatMap(withHeading)),
    sources: part(docs.ideas.blocks, sourcesHeading)
  };
}

/** Документ записи по её номеру. @param {Scope} scope @param {string} number */
export const homeOf = (scope, number) => scope.docs[homes[kindOf(number)]];

/** Сколько записей с этим номером: 0 — нет, больше 1 — неоднозначно. @param {Scope} scope @param {string} number */
export const recordCount = (scope, number) => scope.numbers[kindOf(number)].filter((item) => item === number).length;

/**
 * Где в документе: в записи — её номер, вне записей и в записи с неверным заголовком — заголовок раздела.
 * @param {Scope} scope @param {Kind} kind вид записей документа @param {Block} block
 */
export function placeOf(scope, kind, block) {
  const number = scope.records[kind].includes(block) ? recordNumber(block, kind) : '';
  return number === '' ? block.heading : number;
}

/** Документы задачи с видом их записей, в порядке проверки. @param {Scope} scope @returns {[Doc, Kind][]} */
export function docsWithKinds(scope) {
  return [[scope.docs.ideas, 'D'], [scope.docs.questions, 'Q'], [scope.docs.spec, 'FR']];
}

/** Открытые вопросы в порядке записей. @param {Scope} scope */
export const openQuestions = (scope) => questionNumbers(scope.records.Q.filter(isOpen));

/** Следующие свободные номера: D, Q, а если есть spec.md — FR. @param {Scope} scope */
export function nextNumbers(scope) {
  const next = [nextNumber('D', scope.numbers.D), nextNumber('Q', scope.numbers.Q)];
  return scope.docs.spec.exists ? [...next, nextNumber('FR', scope.numbers.FR)] : next;
}
