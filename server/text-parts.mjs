// @ts-check
// Общие части текстов ответов spec_forge: оформление кода, перечней, команд и замечаний проверки.
// Сами тексты — в texts.mjs. Меняется только в PR критериев, как тексты и договор.

export const nextStep = '**Дальше:**';

/** @typedef {import('./contract.mjs').Source} Source */
/** @typedef {import('./contract.mjs').Remark} Remark */

/** @param {string} value */
export const code = (value) => {
  const ticks = '`'.repeat(Math.max(0, ...[...value.matchAll(/`+/g)].map(([run]) => run.length)) + 1);
  const body = /^`|`$/.test(value) ? ` ${value} ` : value;
  return `${ticks}${body}${ticks}`;
};

/** @param {string[]} items */
export const list = (items) => items.map((item) => `- ${item}`).join('\n');

/** @param {string[]} values */
export const codes = (values) => values.map(code).join(', ');

/** @param {string[]} numbers */
export const next = (numbers) => `Следующие номера: ${codes(numbers)}.`;

/** Ссылка Markdown на файл от корня проекта: имя файла — текстом. @param {string} path */
export const fileLink = (path) => `[${path.slice(path.lastIndexOf('/') + 1)}](${path})`;

/** Путь — кодом, ссылка — как есть. @param {Source} item */
export const source = (item) => ('path' in item ? code(item.path) : item.link);

/** Число с пробелами между разрядами: 10 001. @param {number} value */
export const grouped = (value) => String(value).replace(/\B(?=(\d{3})+$)/g, ' ');

/**
 * Где найдено: в записи — её номер, вне записей — заголовок раздела без знаков `#`.
 * @param {string} file @param {string} place номер записи или заголовок раздела целиком
 */
export const where = (file, place) => (place.startsWith('#') ? `${code(file)}, «${place.replace(/^#+ /, '')}»` : `${code(file)}, ${code(place)}`);

/** Имя команды GigaCode с необязательной задачей. @param {string} name @param {string} [task] */
export const command = (name, task = '') => code(`/spec-forge:${name}${task === '' ? '' : ` ${task}`}`);

/** Что мешает одобрению; хоть один список не пуст. @param {string[]} questions открытые @param {string[]} remarks блокирующие замечания */
export const blocked = (questions, remarks) => `**Одобрить нельзя** — ${[
  ...(questions.length === 0 ? [] : [`открытые вопросы: ${codes(questions)}`]),
  ...(remarks.length === 0 ? [] : [`блокирующие замечания: ${codes(remarks)}`])
].join('; ')}.`;

/** Состояние и препятствия одобрению, если они есть. @param {string} state @param {string[]} questions @param {string[]} remarks */
export const ready = (state, questions, remarks) => (questions.length + remarks.length === 0 ? state : `${state} ${blocked(questions, remarks)}`);

/**
 * Вариант проверки ИИ с путём и что предложить рядом: открыты вопросы — разобрать их; одни отложенные блокирующие
 * замечания — ничего, их снимает только новая проверка; иначе — одобрить.
 * @param {string} option @param {string} way @param {string} task @param {string[]} questions @param {string[]} remarks
 */
export function choice(option, way, task, questions, remarks) {
  if (questions.length > 0) {
    return `${option} — ${way} — или разобрать открытые вопросы. Ответ бизнеса или разработчика — через ${command('sf-note', task)}.`;
  }
  return remarks.length > 0 ? `${option} — ${way}.` : `${option} — ${way} — или «Одобрить» строкой из \`check\`.`;
}

/** Блокирующее замечание перед вопросом о нём: заголовок блока и поля перечнем. @param {Remark} remark */
export const remarkCard = ({ number, place, problem, advice }) => `**Замечание ${code(number)}**\n\n`
  + list([`**Где:** ${place}`, `**Проблема:** ${problem}`, `**Рекомендация:** ${advice}`]);

/** Замечание одной строкой в перечне остальных. @param {Remark} remark */
export const remarkLine = ({ number, place, problem, advice }) => `${code(number)} — ${place}: ${problem}. **Рекомендация:** ${advice}`;
