// @ts-check
// Договор инструмента spec_forge: описание и схема, которые видит модель,
// и все тексты ответов, которые видит пользователь. Меняется только в PR критериев.
// Ответ собирается из этих текстов: абзацы разделяются пустой строкой.

/** Источник из раздела «Источники» в brainstorming.md: путь или ссылка. @typedef {{ path: string } | { link: string }} Source */

/** @param {string} value */
const code = (value) => `\`${value}\``;

/** @param {string[]} items */
const list = (items) => items.map((item) => `- ${item}`).join('\n');

/** Путь — кодом, ссылка — как есть. @param {Source} item */
const source = (item) => ('path' in item ? code(item.path) : item.link);

/** Разделы _work/context.md: заголовки второго уровня, каждый ровно один раз. */
export const contextSections = ['Факты', 'Противоречия', 'Не найдено'];

export const tool = {
  name: 'spec_forge',
  description: 'Spec Forge: состояние задачи и проверки документов требований для скиллов sf-grill, sf-spec, sf-review, sf-note. '
    + 'Действия: status — где остановилась задача и что дальше; check — проверка документов задачи; '
    + 'link — ссылки на записи D, Q, R, FR.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['status', 'check', 'link'],
        description: 'Действие: status, check или link.'
      },
      task: {
        type: 'string',
        description: 'Имя папки задачи в docs/ без пути, например order-search. '
          + 'Для status — существующая задача или имя новой; не указано — status подберёт задачу сам. Для check обязательно.'
      },
      command: {
        type: 'string',
        enum: ['sf-grill', 'sf-spec', 'sf-review', 'sf-note'],
        description: 'Для status: команда, с которой начата работа.'
      }
    },
    required: ['action']
  }
};

export const texts = {
  // Вызов не удался (isError).

  /** @param {string} action */
  notImplemented: (action) => `Действие ${code(action)} пока не реализовано.`,
  noAction: 'Укажите действие: `status`, `check` или `link`.',
  noCommand: 'Укажите команду: `sf-grill`, `sf-spec`, `sf-review` или `sf-note`.',
  /** @param {string} command */
  commandNotImplemented: (command) => `Для ${code(command)} действие \`status\` пока не реализовано.`,
  /** @param {string} task */
  stageNotImplemented: (task) => `У задачи ${code(task)} уже есть \`spec.md\`: определение этапа для неё пока не реализовано.`,
  noTask: 'Укажите задачу: имя папки в `docs/`.',
  /** @param {string} task */
  unknownTask: (task) => `Задачи ${code(task)} нет: не найден ${code(`docs/${task}/brainstorming.md`)}.`,
  /** @param {string} name */
  unknownTool: (name) => `Неизвестный инструмент \`${name}\`.`,
  /** @param {string} method */
  unknownMethod: (method) => `Неизвестный метод \`${method}\`.`,
  badJson: 'Не удалось разобрать сообщение: ожидался JSON.',

  // status: выбор задачи и имя новой папки.

  noOpenTasks: 'Незаконченных обсуждений нет — новая задача.\n\n'
    + 'Дальше: выслушать идею и выбрать имя папки — своё, например принятое в команде, или предложенное агентом латиницей. '
    + 'Затем `status` с этим именем.',
  /** @param {string[]} tasks */
  chooseTask: (tasks) => `Незаконченных обсуждений несколько:\n\n${list(tasks.map(code))}\n\n`
    + 'Дальше: выбрать одну из них или начать новую задачу, затем `status` с её именем.',
  /** @param {string} name */
  cyrillicName: (name) => `Имя папки ${code(name)} написано кириллицей.\n\nДальше: попросить имя латиницей.`,
  /** @param {string} name */
  badName: (name) => `Имя папки ${code(name)} не подходит: нужны латинские буквы, цифры, \`-\`, \`_\` и \`.\`, `
    + 'первый знак — буква или цифра, без пути `docs/`.\n\nДальше: исправить имя.',
  /** @param {string} name */
  folderTaken: (name) => `Папка ${code(`docs/${name}/`)} уже есть, но это не задача Spec Forge: в ней нет \`brainstorming.md\`.\n\n`
    + 'Дальше: выбрать другое имя.',
  /** @param {string} name */
  newTask: (name) => `Новая задача ${code(name)}.\n\n`
    + `Дальше: создать ${code(`docs/${name}/brainstorming.md`)} с запросом и источниками, затем снова \`status\` с этой задачей.`,

  // status: обсуждение и источники.

  /** @param {string} task */
  discussion: (task) => `Задача ${code(task)}: обсуждение, требований ещё нет.`,
  continueDiscussion: 'Дальше: продолжить обсуждение.',
  otherTask: 'Другая задача — `/sf-grill` с описанием идеи.',
  /** @param {string[]} paths */
  missingSources: (paths) => `**Не найдены источники**\n\n${list(paths.map(code))}\n\n`
    + 'Дальше: решить — продолжить без них или сделать их доступными. '
    + 'Если без них — записать решение `D-…` и убрать их из «Источников».',
  /** @param {string} task @param {Source[]} sources */
  studyTask: (task, sources) => [
    '**Задание на изучение источников**',
    `Прочитай ${code(`docs/${task}/brainstorming.md`)} — запрос и решения задачи. Изучи источники:`,
    list(sources.map(source)),
    `Что относится к задаче, запиши в ${code(`docs/${task}/_work/context.md`)}. `
      + `Файла нет — создай с разделами ${contextSections.map((section) => code(`## ${section}`)).join(', ')}. `
      + 'Файл есть — дописывай в его разделы, прежнее не удаляй.',
    list([
      'У каждого факта — источник.',
      'Каждый источник из списка упомяни в «Фактах» или в «Не найдено» так, как он записан выше. Не открылся — тоже в «Не найдено».',
      'Решений не принимай, другие файлы не меняй.',
      `В конце вызови \`spec_forge\` с действием \`check\` и задачей ${code(task)}, исправь ошибки.`
    ]),
    'Дальше: поручить задание отдельному агенту, добавив, что нужно выяснить. Вопросы, не зависящие от источников, задавать сразу.'
  ].join('\n\n'),

  // check.

  noErrors: 'Ошибок нет.',
  /** Строки «где — что». @param {string[]} lines */
  errors: (lines) => `**Ошибки**\n\n${list(lines)}`,
  /** @param {string} file @param {string} section */
  missingSection: (file, section) => `${code(file)} — нет раздела ${code(`## ${section}`)}`,
  /** @param {string} file @param {string} section */
  repeatedSection: (file, section) => `${code(file)} — раздел ${code(`## ${section}`)} повторяется`
};
