// @ts-check
// Действие link: номера D, Q, FR и R в brainstorming.md, questions.md, spec.md и _work/review.md становятся
// ссылками на свои записи, ссылки с номером записи, которые ведут не на неё, исправляются. Заголовки, блоки кода
// и строки до первого заголовка не меняются. Сначала читаются все документы, затем пишутся только изменившиеся.
import { writeFileSync } from 'node:fs';
import { texts } from './texts.mjs';
import { taskProblem } from './docs.mjs';
import { codeOrLink, leadsTo, linkNumber, recordTarget } from './links.mjs';
import { mentionPattern, numberPattern } from './records.mjs';
import { docsWithKinds, placeOf, readDocs, recordCount, scopeOf } from './task.mjs';

/** @typedef {import('./task.mjs').Doc} Doc */
/** @typedef {import('./task.mjs').Scope} Scope */
/** Счёт правок и места неоднозначных номеров. @typedef {{ added: number, fixed: number, notes: string[] }} Tally */

/**
 * Кусок строки по порядку: код в обратных апострофах, ссылка Markdown, адрес http(s) или номер записи в тексте.
 * Код и адрес не меняются, кроме кода, в котором только номер.
 */
const piece = new RegExp(`${codeOrLink}|https?://[^\\s)>\\]]+|${mentionPattern}`, 'gu');

/** Только номер в обратных апострофах. */
const codeNumber = new RegExp(`^\`(${numberPattern})\`$`);

/** Только номер. */
const bareNumber = new RegExp(`^${numberPattern}$`);

/** Поле вызова — строка; не строка или нет поля — пусто. @param {{ task: string }} call @returns {import('./status.mjs').Answer} */
export function link({ task }) {
  const problem = taskProblem(task);
  if (problem !== '') return { error: problem };
  const scope = scopeOf(readDocs(task));
  /** @type {Tally} */
  const tally = { added: 0, fixed: 0, notes: [] };
  for (const [doc, kind] of docsWithKinds(scope)) {
    const text = relink(doc, kind, scope, tally);
    if (text !== doc.text) writeFileSync(doc.path, text);
  }
  const notes = [...new Set(tally.notes)];
  return [texts.linked(tally.added, tally.fixed), ...(notes.length === 0 ? [] : [texts.notLinked(notes)])].join('\n\n');
}

/**
 * Текст документа с проставленными ссылками; переводы строк остаются как были.
 * @param {Doc} doc @param {import('./records.mjs').Kind} kind @param {Scope} scope @param {Tally} tally
 */
function relink(doc, kind, scope, tally) {
  // Строки на чётных местах, переводы строк между ними — на нечётных.
  const parts = doc.text.split(/(\r?\n)/);
  for (const block of doc.blocks) {
    const place = placeOf(scope, kind, block);
    block.rows.forEach((row) => {
      parts[2 * row] = parts[2 * row].replace(piece, (match, text, target) => rewrite({ scope, doc, place, tally }, match, text, target));
    });
  }
  return parts.join('');
}

/**
 * Номер записи в куске: текст ссылки, код из одного номера или номер в тексте; другое — пусто.
 * @param {string} match @param {string | undefined} text @param {string | undefined} target
 */
function pieceNumber(match, text, target) {
  if (target !== undefined) return linkNumber(/** @type {string} */ (text));
  const code = codeNumber.exec(match);
  if (code) return code[1];
  return bareNumber.test(match) ? match : '';
}

/**
 * Кусок строки после правки. Номер, которого нет, не меняется — его покажет check; номер у нескольких
 * записей не меняется и попадает в «Не исправлено».
 * @param {{ scope: Scope, doc: Doc, place: string, tally: Tally }} at
 * @param {string} match кусок целиком @param {string | undefined} text текст ссылки @param {string | undefined} target адрес ссылки
 */
function rewrite(at, match, text, target) {
  const number = pieceNumber(match, text, target);
  const count = number === '' ? 0 : recordCount(at.scope, number);
  if (count === 0) return match;
  if (count > 1) {
    at.tally.notes.push(texts.ambiguousNumber(at.doc.path, at.place, number));
    return match;
  }
  const address = recordTarget(at.scope, at.doc.path, number);
  if (target === undefined) {
    at.tally.added += 1;
    return `[${match}](${address})`;
  }
  if (leadsTo(at.scope, at.doc.path, target, number)) return match;
  at.tally.fixed += 1;
  return `[${text}](${address})`;
}
