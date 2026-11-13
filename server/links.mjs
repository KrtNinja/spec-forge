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
 * Ссылка `[текст](адрес)` или картинка `![текст](адрес)`: `!` картинки (у ссылки пусто), текст и адрес.
 * @typedef {{ image: string, text: string, target: string }} Link
 */

/**
 * Кусок строки, который читается целиком: код в обратных апострофах (закрывается столькими же апострофами),
 * ссылка-сноска `[текст][метка]`, строка адреса сноски `[метка]: адрес`, ссылка или картинка с группами Link,
 * ссылка или картинка с подсказкой после адреса. Номер внутри куска — не упоминание, ссылка внутри кода — пример.
 * Проверяются и меняются только ссылки и картинки с группами. Разбирается одна строка.
 */
export const codeOrLink = [
  '(?<ticks>`+)[^\\n]*?(?<!`)\\k<ticks>(?!`)',
  '\\[[^\\]\\n]*\\]\\[[^\\]\\n]*\\]',
  '^\\[[^\\]\\n]+\\]:.*',
  '(?<image>!?)\\[(?<text>[^\\]\\n]*)\\]\\((?<target>[^)\\s]*)\\)',
  '!?\\[[^\\]\\n]*\\]\\([^)\\n]*\\)'
].join('|');
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
 * Номер записи, на которую ведёт якорь записи в документе задачи, без учёта регистра: `#D-07` — `D-07`.
 * Такой записи в документе нет — пусто. Файл не документ задачи или якорь не якорь записи — undefined: не проверяется.
 * @param {Scope} scope @param {{ file: string, anchor: string }} address @returns {string | undefined}
 */
function anchoredNumber(scope, { file, anchor }) {
  const home = docsWithKinds(scope).find(([item]) => item.path === file);
  if (home === undefined || !recordAnchor.test(anchor)) return undefined;
  return scope.numbers[home[1]].find((number) => number.toLowerCase() === anchor.toLowerCase()) || '';
}

/**
 * Ссылка в тупик: файла нет или якорь записи не ведёт на запись этого документа задачи.
 * Внешние адреса, якоря заголовков и якоря в других файлах не проверяются.
 * @param {Scope} scope @param {string} doc @param {string} target
 */
function isDead(scope, doc, target) {
  if (external.test(target)) return false;
  const address = resolve(doc, target);
  return !existsSync(address.file) || anchoredNumber(scope, address) === '';
}

/**
 * Адрес с якорем записи строчными, если якорь записан заглавными, а запись есть в файле адреса:
 * `brainstorming.md#D-01` — `brainstorming.md#d-01`. Иначе пусто — адрес не меняется.
 * @param {Scope} scope @param {string} doc @param {string} target
 */
export function lowerAnchor(scope, doc, target) {
  const address = resolve(doc, target);
  const number = anchoredNumber(scope, address);
  if (!number || address.anchor === number.toLowerCase()) return '';
  return `${target.slice(0, -address.anchor.length)}${number.toLowerCase()}`;
}

/** Ссылки и картинки в строках по порядку, без других кусков. @param {string[]} lines @returns {Link[]} */
const linksIn = (lines) => lines.flatMap((line) => [...line.matchAll(markdownLink)])
  .flatMap(({ groups }) => {
    // Именованные группы есть у каждого совпадения; target заполнен только у ссылки или картинки.
    const link = /** @type {Link} */ (groups);
    return link.target === undefined ? [] : [link];
  });

/**
 * Ошибки ссылок Markdown в строках: ссылка с номером записи ведёт не на неё, другая ссылка — в тупик или с якорем
 * записи заглавными. Номер, которого нет, здесь не показывается: его покажет «нет записи». Картинка — ссылка на файл:
 * номер в подписи не делает её ссылкой на запись, а якорь в ней `link` не меняет.
 * @param {Scope} scope @param {string} doc путь документа @param {string} place @param {string[]} lines
 */
export function linkErrors(scope, doc, place, lines) {
  return linksIn(lines).flatMap(({ image, text, target }) => {
    const number = image ? '' : linkNumber(text);
    if (number !== '') {
      return recordCount(scope, number) === 0 || leadsTo(scope, doc, target, number)
        ? [] : [texts.wrongLink(doc, place, number, target)];
    }
    if (isDead(scope, doc, target)) return [texts.deadLink(doc, place, target)];
    return !image && lowerAnchor(scope, doc, target) !== '' ? [texts.anchorCase(doc, place, target)] : [];
  });
}
