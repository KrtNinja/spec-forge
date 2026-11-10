// @ts-check
// Записи D и Q: номер в заголовке, поля «- Поле: значение», упоминания номеров в тексте.
// Решения D — подразделы «Решений» brainstorming.md, вопросы Q — разделы questions.md, кроме первого уровня.
import { blockingValues, decisionsHeading, questionFields, questionStatuses } from './contract.mjs';
import { level, part } from './docs.mjs';

/** @typedef {import('./docs.mjs').Block} Block */
/** Вид записи: решение или вопрос. @typedef {'D' | 'Q'} Kind */

/** Номер: две цифры и больше, без лишних нулей впереди. */
const digits = '(?:0[1-9]|[1-9]\\d+)';

/**
 * Упоминание номера D или Q — не часть слова, пути или имени файла: `docs/D-07.md`, `D-07-api.md`
 * и `D-07/api.md` номером не считаются, а `D-07.` в конце предложения и `` `D-07` `` — считаются.
 */
const mention = /(?<![\p{L}\p{N}_./\\-])[DQ]-\d+(?![\p{L}\p{N}_/\\-]|\.[\p{L}\p{N}_])/gu;

const [, notBlocking] = blockingValues;

/** Записи-решения: подразделы «Решений» с любыми заголовками. @param {Block[]} list разделы brainstorming.md */
export function decisionBlocks(list) {
  return part(list, decisionsHeading).filter((block) => block.heading !== decisionsHeading);
}

/** Записи-вопросы: разделы с любыми заголовками, кроме первого уровня. @param {Block[]} list разделы questions.md */
export function questionBlocks(list) {
  return list.filter((block) => level(block.heading) > 1);
}

/** Номер записи по заголовку вида `### D-07`; заголовок другой — пусто. @param {Block} block @param {Kind} kind */
export function recordNumber(block, kind) {
  return new RegExp(`^### ${kind}-${digits}$`).test(block.heading) ? block.heading.slice(4) : '';
}

/** Упомянутые в строках номера D и Q по порядку, без повторов. @param {string[]} lines */
export function numbersIn(lines) {
  return [...new Set(lines.join('\n').match(mention))];
}

/** Значения поля «- Поле: значение» по порядку, без пробелов по краям. @param {string[]} lines @param {string} name */
export function fieldValues(lines, name) {
  const prefix = `- ${name}:`;
  return lines.filter((line) => line.startsWith(prefix)).map((line) => line.slice(prefix.length).trim());
}

/**
 * Значение поля; поля нет или оно повторяется — пусто: у повторённого поля значения нет.
 * @param {string[]} lines @param {string} name
 */
export function field(lines, name) {
  const values = fieldValues(lines, name);
  return values.length === 1 ? values[0] : '';
}

/**
 * Вопрос блокирует подготовку требований: не решён, не «не входит» и не помечен «Блокирует: нет».
 * Нет поля, значение с ошибкой или поле повторяется — блокирует: ошибку покажет check, а переход не откроется раньше времени.
 * @param {Block} block
 */
export function isBlocking(block) {
  const state = field(block.lines, questionFields.status);
  return state !== questionStatuses.solved && state !== questionStatuses.outOfScope
    && field(block.lines, questionFields.blocking) !== notBlocking;
}

/** Следующий свободный номер: наибольший плюс один; записей нет — первый. @param {Kind} kind @param {string[]} numbers */
export function nextNumber(kind, numbers) {
  const last = Math.max(0, ...numbers.map((number) => Number(number.slice(2))));
  return `${kind}-${String(last + 1).padStart(2, '0')}`;
}
