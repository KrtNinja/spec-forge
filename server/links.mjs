// @ts-check
// Ссылки Markdown в документах задачи: куда ведёт адрес и какой адрес у ссылки на запись правильный.
// Адрес — от папки документа. Внешние адреса (со схемой) в тупик не ведут; ссылка на запись с ним — неверная.
import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import { texts } from './texts.mjs';
import { numberPattern } from './records.mjs';
import { docsWithKinds, homeOf, recordCount } from './task.mjs';

/** @typedef {import('./task.mjs').Scope} Scope */

/**
 * Код в обратных апострофах или ссылка Markdown `[текст](адрес)` с текстом и адресом в группах.
 * Ссылка внутри кода — пример, а не ссылка.
 */
export const codeOrLink = '`[^`\\n]*`|\\[([^\\]\\n]*)\\]\\(([^)\\s]*)\\)';
const markdownLink = new RegExp(codeOrLink, 'g');

/** Текст ссылки — номер записи, можно в обратных апострофах. */
const numberText = new RegExp(`^(\`?)(${numberPattern})\\1$`);

/** Адрес со схемой: `https:`, `mailto:`. */
const external = /^[a-z][a-z\d+.-]*:/i;

/** Якорь записи: `#d-07`, `#q-01`, `#fr-03`, `#r-02`. */
const recordAnchor = new RegExp(`^${numberPattern}$`, 'i');

/** Номер записи в тексте ссылки без обратных апострофов; текст другой — пусто. @param {string} text */
export function linkNumber(text) {
  const match = numberText.exec(text);
  return match ? match[2] : '';
}

/**
 * Файл от корня проекта и якорь, куда ведёт адрес из документа doc. Без файла — сам документ.
 * @param {string} doc путь документа от корня @param {string} target адрес как записан
 */
function resolve(doc, target) {
  const [path, ...anchor] = target.split('#');
  return { file: path === '' ? doc : posix.join(posix.dirname(doc), path), anchor: anchor.join('#') };
}

/** Правильный адрес ссылки на запись из документа doc: в своём файле — только якорь. @param {Scope} scope @param {string} doc @param {string} number */
export function recordTarget(scope, doc, number) {
  const home = homeOf(scope, number).path;
  const anchor = `#${number.toLowerCase()}`;
  return home === doc ? anchor : `${posix.relative(posix.dirname(doc), home)}${anchor}`;
}

/** Ссылка на запись ведёт на неё: на её файл, в том числе по имени из своего файла, и на её якорь. @param {Scope} scope @param {string} doc @param {string} target @param {string} number */
export function leadsTo(scope, doc, target, number) {
  const { file, anchor } = resolve(doc, target);
  return file === homeOf(scope, number).path && anchor === number.toLowerCase();
}

/**
 * Ссылка в тупик: файла нет или якорь записи не ведёт на запись этого документа задачи.
 * Внешние адреса, якоря заголовков и якоря в других файлах не проверяются.
 * @param {Scope} scope @param {string} doc @param {string} target
 */
function isDead(scope, doc, target) {
  if (external.test(target)) return false;
  const { file, anchor } = resolve(doc, target);
  if (!existsSync(file)) return true;
  const home = docsWithKinds(scope).find(([item]) => item.path === file);
  if (home === undefined || !recordAnchor.test(anchor)) return false;
  return !scope.numbers[home[1]].some((number) => number.toLowerCase() === anchor);
}

/**
 * Ошибки ссылок Markdown в строках: ссылка с номером записи ведёт не на неё, другая ссылка — в тупик.
 * Номер, которого нет, здесь не показывается: его покажет «нет записи».
 * @param {Scope} scope @param {string} doc путь документа @param {string} place @param {string[]} lines
 */
export function linkErrors(scope, doc, place, lines) {
  const links = lines.flatMap((line) => [...line.matchAll(markdownLink)]).filter((match) => match[2] !== undefined);
  return links.flatMap(([, text, target]) => {
    const number = linkNumber(text);
    if (number === '') return isDead(scope, doc, target) ? [texts.deadLink(doc, place, target)] : [];
    return recordCount(scope, number) === 0 || leadsTo(scope, doc, target, number)
      ? [] : [texts.wrongLink(doc, place, number, target)];
  });
}
