// @ts-check
// Записи D, Q и FR: номер в заголовке, поля «- Поле: значение», упоминания номеров в тексте.
// Решения D — подразделы «Решений» brainstorming.md, вопросы Q — разделы questions.md, кроме первого уровня,
// требования FR — подразделы «Требований» spec.md.
import { blockingValues, decisionsHeading, questionFields, questionStatuses, requirementsHeading } from './contract.mjs';
import { level, part } from './docs.mjs';

/** @typedef {import('./docs.mjs').Block} Block */
/** Вид записи: решение, вопрос или требование. @typedef {'D' | 'Q' | 'FR'} Kind */

/** Номер: две цифры и больше, без лишних нулей впереди. */
const digits = '(?:0[1-9]|[1-9]\\d+)';

/**
 * Упоминание номера D, Q или FR — не часть слова, пути или имени файла: `docs/D-07.md`, `D-07-api.md`
 * и `D-07/api.md` номером не считаются, а `D-07.` в конце предложения и `` `D-07` `` — считаются.
 */
export const mentionPattern = '(?<![\\p{L}\\p{N}_./\\\\-])(?:FR|[DQ])-\\d+(?![\\p{L}\\p{N}_/\\\\-]|\\.[\\p{L}\\p{N}_])';
const mention = new RegExp(mentionPattern, 'gu');

/** Адрес ссылки Markdown и адрес http(s) в тексте: в них номер — часть пути, а не упоминание. */
const address = /\]\([^)\n]*\)|https?:\/\/[^\s)>\]]+/g;

const [, notBlocking] = blockingValues;

/** Записи-решения: подразделы «Решений» с любыми заголовками. @param {Block[]} list разделы brainstorming.md */
export function decisionBlocks(list) {
  return part(list, decisionsHeading).filter((block) => block.heading !== decisionsHeading);
}

/** Записи-вопросы: разделы с любыми заголовками, кроме первого уровня. @param {Block[]} list разделы questions.md */
export function questionBlocks(list) {
  return list.filter((block) => level(block.heading) > 1);
}

/** Записи-требования: подразделы «Требований» с любыми заголовками. @param {Block[]} list разделы spec.md */
export function requirementBlocks(list) {
  return part(list, requirementsHeading).filter((block) => block.heading !== requirementsHeading);
}

/** Номер записи по заголовку вида `### D-07`; заголовок другой — пусто. @param {Block} block @param {Kind} kind */
export function recordNumber(block, kind) {
  return new RegExp(`^### ${kind}-${digits}$`).test(block.heading) ? block.heading.slice(4) : '';
}

/** Вид записи по номеру: `FR-01` — `FR`. @param {string} number */
export const kindOf = (number) => /** @type {Kind} */ (number.slice(0, number.indexOf('-')));

/** Упомянутые в строках номера D, Q и FR по порядку, без повторов. @param {string[]} lines */
export function numbersIn(lines) {
  return [...new Set(lines.join('\n').replace(address, ' ').match(mention))];
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
 * Вопрос открыт: не решён и не «не входит». Нет статуса, он с ошибкой или повторяется — открыт:
 * ошибку покажет check, а переход не откроется раньше времени.
 * @param {Block} block
 */
export function isOpen(block) {
  const state = field(block.lines, questionFields.status);
  return state !== questionStatuses.solved && state !== questionStatuses.outOfScope;
}

/** Вопрос блокирует подготовку требований: открыт и не помечен «Блокирует: нет». @param {Block} block */
export function isBlocking(block) {
  return isOpen(block) && field(block.lines, questionFields.blocking) !== notBlocking;
}

/** Номера вопросов по заголовкам, в порядке записей. @param {Block[]} list */
export const questionNumbers = (list) => list.map((block) => block.heading.replace(/^#+ /, ''));

/** Следующий свободный номер: наибольший плюс один; записей нет — первый. @param {Kind} kind @param {string[]} numbers */
export function nextNumber(kind, numbers) {
  const last = Math.max(0, ...numbers.map((number) => Number(number.slice(kind.length + 1))));
  return `${kind}-${String(last + 1).padStart(2, '0')}`;
}
