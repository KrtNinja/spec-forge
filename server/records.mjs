// @ts-check
// Записи D, Q, FR и R: номер в заголовке, поля и упоминания номеров в тексте. У FR — название,
// необязательный пример цитатой и основание в sub/sup; остальные записи — с полями «- Поле: значение».
// Решения D — подразделы «Решений» brainstorming.md, вопросы Q — разделы questions.md, кроме первого уровня,
// требования FR — подразделы «Требований» spec.md, замечания R — разделы _work/review.md третьего уровня и ниже.
import {
  blockingValues, decisionsHeading, questionFields, questionStatuses, remarkDecisions, remarkFields, remarkImportance,
  requirementFields, requirementsHeading
} from './contract.mjs';
import { level, part } from './docs.mjs';

/** @typedef {import('./docs.mjs').Block} Block */
/** Вид записи: решение, вопрос, требование или замечание проверки. @typedef {'D' | 'Q' | 'FR' | 'R'} Kind */

/** Номер: две цифры и больше, без лишних нулей впереди. */
const digits = '(?:0[1-9]|[1-9]\\d+)';

/** Заголовок FR: номер в обратных апострофах и название с одиночными пробелами. */
const requirementHeading = new RegExp(`^#### \`(FR-${digits})\` [\\p{L}\\p{N}-]+(?: [\\p{L}\\p{N}-]+)*$`, 'u');

/** Обрамление полей FR; остальные поля читаются как пункты списка. */
const requirementMarks = new Map([
  [requirementFields.example, ['> ', '']],
  [requirementFields.basis, ['<sub><sup>', '</sup></sub>']]
]);

/** Номер записи любого вида: вид, дефис и цифры. */
export const numberPattern = '(?:FR|[DQR])-\\d+';

/**
 * Упоминание номера записи — не часть слова, пути или имени файла: `docs/D-07.md`, `D-07-api.md`
 * и `D-07/api.md` номером не считаются, а `D-07.` в конце предложения и `` `D-07` `` — считаются.
 */
export const mentionPattern = `(?<![\\p{L}\\p{N}_./\\\\-])${numberPattern}(?![\\p{L}\\p{N}_/\\\\-]|\\.[\\p{L}\\p{N}_])`;
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

/** Записи FR: четвёртый уровень и ниже; третий с номером FR тоже проверяется как ошибочная запись. @param {Block[]} list */
export function requirementBlocks(list) {
  return part(list, requirementsHeading).filter((block) => level(block.heading) > 3
    || (level(block.heading) === 3 && numbersIn([block.heading]).some((number) => number.startsWith('FR-'))));
}

/** Записи-замечания: разделы с любыми заголовками третьего уровня и ниже. @param {Block[]} list разделы _work/review.md */
export function remarkBlocks(list) {
  return list.filter((block) => level(block.heading) > 2);
}

/**
 * Замечания последнего раздела проверки: каждый заголовок первого или второго уровня начинает раздел заново,
 * а без таких заголовков раздел — весь файл. @param {Block[]} list разделы _work/review.md
 */
export function latestRemarks(list) {
  return list.reduce((latest, block) => (level(block.heading) < 3 ? [] : [...latest, block]), /** @type {Block[]} */ ([]));
}

/** Номер по заголовку своего вида; заголовок неверен — пусто. @param {Block} block @param {Kind} kind */
export function recordNumber(block, kind) {
  if (kind === 'FR') return requirementHeading.exec(block.heading)?.[1] || '';
  return new RegExp(`^### ${kind}-${digits}$`).test(block.heading) ? block.heading.slice(4) : '';
}

/** Вид записи по номеру: `FR-01` — `FR`. @param {string} number */
export const kindOf = (number) => /** @type {Kind} */ (number.slice(0, number.indexOf('-')));

/** Упомянутые в строках номера записей по порядку, без повторов. @param {string[]} lines */
export function numbersIn(lines) {
  return [...new Set(lines.join('\n').replace(address, ' ').match(mention))];
}

/** Значения поля своего формата по порядку, без пробелов по краям. @param {string[]} lines @param {string} name */
export function fieldValues(lines, name) {
  const [opening, ending] = requirementMarks.get(name) || ['- ', ''];
  const prefix = `${opening}${name}:`;
  return lines.filter((line) => line.startsWith(prefix) && line.trimEnd().endsWith(ending))
    .map((line) => line.trimEnd().slice(prefix.length, ending === '' ? undefined : -ending.length).trim());
}

/** Пункт «- Имя: значение»: за двоеточием пробел или конец строки; `- https://…` полем не считается. */
const fieldItem = /^- ([^:]+):(?: |$)/;

/**
 * Имена полей не из образца, без повторов: пункты «- Имя: значение» после первого поля образца.
 * Пункты до первого поля — текст записи, например «- Вариант: …»; полей образца нет — пусто.
 * @param {string[]} lines @param {string[]} names поля образца
 */
export function extraFields(lines, names) {
  let fields = false;
  /** @type {string[]} */
  const found = [];
  for (const line of lines) {
    fields = fields || names.some((name) => line.startsWith(`- ${name}:`));
    const item = fieldItem.exec(line);
    if (fields && item !== null && !names.includes(item[1])) found.push(item[1]);
  }
  return [...new Set(found)];
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

/** Замечание блокирует: «Важность: блокирует». @param {Block} block */
export const isBlockingRemark = (block) => field(block.lines, remarkFields.importance) === remarkImportance.blocking;

/** Решение по замечанию; поля нет, оно пустое или повторяется — пусто: замечание не разобрано. @param {Block} block */
export const remarkDecision = (block) => field(block.lines, remarkFields.decision);

/** Решения, при которых блокирующее замечание мешает одобрению: решения нет или оно отложено (FR-19). */
const hindering = ['', remarkDecisions.postponed];

/** Блокирующее замечание мешает одобрению: без решения или отложено. @param {Block} block */
export const hindersApproval = (block) => isBlockingRemark(block) && hindering.includes(remarkDecision(block));

/** Номера записей по заголовкам, в порядке записей. @param {Block[]} list */
export const headingNumbers = (list) => list.map((block) => block.heading.replace(/^#+ /, ''));

/** Следующий свободный номер: наибольший плюс один; записей нет — первый. @param {Kind} kind @param {string[]} numbers */
export function nextNumber(kind, numbers) {
  const last = Math.max(0, ...numbers.map((number) => Number(number.slice(kind.length + 1))));
  return `${kind}-${String(last + 1).padStart(2, '0')}`;
}
