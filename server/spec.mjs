// @ts-check
// spec.md: строка статуса, сумма одобрения, размер и абзацы ответа check после строки номеров.
import { createHash } from 'node:crypto';
import { approvedPattern, approvedStatus, draftStatus, specLimit, statusPrefix, texts } from './contract.mjs';
import { scan, textLines } from './docs.mjs';
import { openQuestions } from './task.mjs';

/** @typedef {import('./task.mjs').Scope} Scope */

/** Строки статуса вне блоков кода: номер строки и строка без пробелов в конце. @param {string} text */
function statusLines(text) {
  return scan(text).flatMap(({ line, code }, row) => (!code && line.startsWith(statusPrefix) ? [{ row, line: line.trimEnd() }] : []));
}

/**
 * Сумма: первые шесть знаков SHA-256 текста без строки статуса, приведённого к одному виду:
 * переводы строк LF, без пробелов в конце строк и без пустых строк в конце.
 * @param {string} text @param {number} row номер строки статуса
 */
function sum(text, row) {
  const lines = textLines(text).filter((_, index) => index !== row).map((line) => line.trimEnd());
  return createHash('sha256').update(lines.join('\n').replace(/\n+$/, '')).digest('hex').slice(0, 6);
}

/** Сегодняшняя дата ГГГГ-ММ-ДД по часам компьютера. */
function today() {
  const now = new Date();
  const [month, day] = [now.getMonth() + 1, now.getDate()].map((part) => String(part).padStart(2, '0'));
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Одобрение по строке статуса: сумма из строки одобрения и сумма текста. Строка статуса не одна — обе пусты,
 * не строка одобрения — пуста первая.
 * @param {string} text
 */
export function approvalOf(text) {
  const found = statusLines(text);
  if (found.length !== 1) return { approved: '', actual: '' };
  const match = approvedPattern.exec(found[0].line);
  return { approved: match ? match[2] : '', actual: sum(text, found[0].row) };
}

/** Одобрена ли задача: в spec.md одна строка статуса, и это строка одобрения. Сумма не сверяется. @param {string} text */
export const isApproved = (text) => approvalOf(text).approved !== '';

/** Строка статуса есть, ровно одна и одного из двух видов. @param {string} file @param {string} text */
export function statusErrors(file, text) {
  const found = statusLines(text);
  if (found.length === 0) return [texts.noStatusLine(file)];
  if (found.length > 1) return [texts.repeatedStatusLine(file)];
  const { line } = found[0];
  return line === draftStatus || approvedPattern.test(line) ? [] : [texts.badStatusLine(file, line)];
}

/**
 * Абзацы после строки номеров, если есть spec.md: предупреждение о размере, затем, если ошибок нет, одобрение.
 * @param {Scope} scope @param {boolean} clean ошибок нет
 */
export function specNotes(scope, clean) {
  const { spec } = scope.docs;
  if (!spec.exists) return [];
  const count = spec.text.replace(/[^\p{L}\p{N}]/gu, '').length;
  const warning = count > specLimit ? [texts.bigSpec(spec.path, count)] : [];
  return clean ? [...warning, approvalNote(scope)] : warning;
}

/**
 * Ошибок нет: открытые вопросы — раньше всего, затем готовая строка одобрения для черновика,
 * для одобренного — сообщение об одобрении или «сумма не совпадает».
 * @param {Scope} scope
 */
function approvalNote(scope) {
  const { spec, questions } = scope.docs;
  const open = openQuestions(scope);
  if (open.length > 0) return texts.approvalBlocked(open);
  const { approved, actual } = approvalOf(spec.text);
  if (approved === '') return texts.approvalReady(spec.path, approvedStatus(today(), actual));
  if (approved !== actual) return texts.changedAfterApproval(spec.path);
  return texts.approved(spec.path, questions.exists ? questions.path : '');
}
