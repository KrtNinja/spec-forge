// @ts-check
// Документы задач в docs/: какие папки считаются задачами, разделы Markdown и источники в них.
// Пути — от корня проекта: сервер запускается в нём.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { texts } from './contract.mjs';

/** @typedef {import('./contract.mjs').Source} Source */

/** Документ задачи есть, но не читается: вызов не удаётся, сервер продолжает работу. */
export class Unreadable extends Error {
  /** @param {string} path */
  constructor(path) {
    super(texts.unreadable(path));
  }
}

/** Имя папки задачи: латинские буквы, цифры, `-`, `_` и `.`, первый знак — буква или цифра. */
export const validName = /^[A-Za-z0-9][\w.-]*$/;

/** Источник: путь в обратных апострофах, ссылка Markdown или адрес http(s). */
const sourceToken = /`([^`\n]+)`|\[[^\]\n]*\]\(([^)\s]+)\)|(https?:\/\/[^\s)>\]]+)/g;

/** @param {string} task @param {string} file путь внутри папки задачи */
export const taskFile = (task, file) => `docs/${task}/${file}`;

/**
 * Текст документа; нет документа — пусто. Есть, но не читается (папка, нет прав) — Unreadable.
 * @param {string} path
 */
export function readText(path) {
  if (!existsSync(path)) return '';
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Unreadable(path);
  }
}

/**
 * Задача — папка `docs/<имя>` с `brainstorming.md`, имя подходит под validName.
 * Не читается ли `brainstorming.md`, выясняется при чтении.
 * @param {string} name
 */
export function isTask(name) {
  return validName.test(name) && existsSync(taskFile(name, 'brainstorming.md'));
}

/** Задача для `check` и `link`: не указана или её нет — текст ошибки, иначе пусто. @param {string} task */
export function taskProblem(task) {
  if (task === '') return texts.noTask;
  return isTask(task) ? '' : texts.unknownTask(task);
}

/** Имена всех задач по алфавиту; нет `docs/` — задач нет. */
export function tasks() {
  return existsSync('docs') && statSync('docs').isDirectory() ? readdirSync('docs').filter(isTask).sort() : [];
}

/** Ограда блока кода: ``` или ~~~ не короче трёх знаков, отступ до трёх пробелов. */
const fenceOpen = /^ {0,3}(`{3,}|~{3,})/;

/** Строки документа без переводов строк: номер строки в документе — номер в этом списке. @param {string} text */
export const textLines = (text) => text.split(/\r?\n/);

/**
 * Строки документа по порядку и признак: внутри блока кода, вместе с оградами, или нет.
 * Блоки кода не разбираются: заголовки, источники, номера записей и строка статуса в примерах не настоящие.
 * @param {string} text
 */
export function scan(text) {
  // Закрывающая строка открытого блока кода; нет — вне блока.
  /** @type {RegExp | undefined} */
  let closing;
  return textLines(text).map((line) => {
    const code = closing !== undefined || fenceOpen.test(line);
    if (closing) {
      if (closing.test(line)) closing = undefined;
    } else if (code) {
      // Закрывает строка только из знаков ограды — тех же и не меньше, отступ до трёх пробелов.
      const fence = line.trim().replace(/[^`~].*$/, '');
      closing = new RegExp(`^ {0,3}${fence}[${fence}]*\\s*$`);
    }
    return { line, code };
  });
}

/**
 * Раздел документа: заголовок целиком, строки под ним и их номера в документе.
 * @typedef {{ heading: string, lines: string[], rows: number[] }} Block
 */

/**
 * Разделы документа по порядку: заголовок любого уровня и строки до следующего заголовка.
 * Строки до первого заголовка ни к одному разделу не относятся, блоки кода пропускаются целиком.
 * @param {string} text
 */
export function blocks(text) {
  /** @type {Block[]} */
  const result = [];
  scan(text).forEach(({ line, code }, row) => {
    const current = result.at(-1);
    if (code) return;
    if (/^#{1,6} /.test(line)) result.push({ heading: line.trimEnd(), lines: [], rows: [] });
    else if (current) {
      current.lines.push(line);
      current.rows.push(row);
    }
  });
  return result;
}

/** Заголовки документа по порядку, например `## Факты`. @param {string} text */
export function headings(text) {
  return blocks(text).map((block) => block.heading);
}

/** Уровень заголовка — число знаков `#` в начале. @param {string} heading */
export const level = (heading) => heading.length - heading.replace(/^#+/, '').length;

/**
 * Раздел с подразделами: блоки от заголовка до следующего заголовка первого или второго уровня.
 * Заголовок повторяется — блоки всех его разделов.
 * @param {Block[]} list @param {string} heading заголовок второго уровня, например `## Решения`
 */
export function part(list, heading) {
  let current = '';
  return list.filter((block) => {
    if (level(block.heading) < 3) current = block.heading;
    return current === heading;
  });
}

/**
 * Строки под заголовком до следующего заголовка любого уровня; заголовок повторяется — строки всех его разделов.
 * @param {string} text @param {string} heading заголовок целиком, например `## Источники`
 */
export function section(text, heading) {
  return blocks(text).filter((block) => block.heading === heading).flatMap((block) => block.lines);
}

/**
 * Упоминания источников в тексте по порядку: где начинается и что за источник.
 * @param {string} text
 * @returns {{ index: number, source: Source }[]}
 */
function mentions(text) {
  return [...text.matchAll(sourceToken)].map((match) => ({
    index: match.index,
    // Ссылка Markdown и адрес — разные группы; незаполненная склеивается в пустую строку.
    source: match[1] === undefined ? { link: match.slice(2).join('') } : { path: match[1] }
  }));
}

/**
 * Источники из пунктов перечня: пункт «- » начинается с источника, остальное в нём — пояснение.
 * @param {string[]} lines
 * @returns {Source[]}
 */
export function listedSources(lines) {
  return lines.flatMap((line) => {
    const first = mentions(line)[0];
    return line.startsWith('- ') && first?.index === 2 ? [first.source] : [];
  });
}

/** Чем сравнивать источники: путь и ссылка с одинаковым текстом — разные источники. @param {Source} source */
export const sourceKey = (source) => JSON.stringify(source);

/** Источники, упомянутые где угодно в строках, — ключами sourceKey. @param {string[]} lines */
export function mentionedKeys(lines) {
  return mentions(lines.join('\n')).map((item) => sourceKey(item.source));
}
