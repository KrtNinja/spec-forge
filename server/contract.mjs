// @ts-check
// Договор инструмента spec_forge: описание и схема, которые видит модель,
// и все тексты ответов, которые видит пользователь. Меняется только в PR критериев.
// Ответ собирается из этих текстов: абзацы разделяются пустой строкой.

/** Источник из раздела «Источники» в brainstorming.md: путь или ссылка. @typedef {{ path: string } | { link: string }} Source */

/** @param {string} value */
const code = (value) => `\`${value}\``;

/** @param {string[]} items */
const list = (items) => items.map((item) => `- ${item}`).join('\n');

/** @param {string[]} numbers */
const next = (numbers) => `Следующие номера: ${numbers.map(code).join(', ')}.`;

/** Путь — кодом, ссылка — как есть. @param {Source} item */
const source = (item) => ('path' in item ? code(item.path) : item.link);

/** Подразделы «Источников» в _work/context.md: источник открылся при изучении или нет. */
export const studiedHeading = '### Изучено';
export const failedHeading = '### Не изучено';

/** Заголовки _work/context.md в порядке заготовки; каждый ровно один раз. */
export const contextHeadings = ['## Источники', studiedHeading, failedHeading, '## Факты', '## Противоречия', '## Не найдено'];

/** Разделы brainstorming.md в порядке образца; каждый ровно один раз. */
export const sourcesHeading = '## Источники';
export const decisionsHeading = '## Решения';
export const outOfScopeHeading = '## Не входит в задачу';
export const brainstormingHeadings = ['## Запрос', sourcesHeading, decisionsHeading, outOfScopeHeading];

// Записи. Заголовок записи — только номер, например `### D-07`: две цифры и больше, без лишних нулей впереди.
// Решения D — под «Решениями» brainstorming.md, вопросы Q — в questions.md. Поле записи — пункт «- Поле: значение»,
// каждое поле из договора — не больше одного раза.

/** Поле решения D, которое должно быть заполнено: решение пользователя. */
export const decisionField = 'Решение';

/** Поля вопроса Q в порядке образца. */
export const questionFields = { stage: 'Этап', blocking: 'Блокирует', help: 'Помощь', status: 'Статус', answer: 'Ответ' };

/** Допустимые значения «Блокирует». Значения «Этап» — команды из схемы инструмента. */
export const blockingValues = ['да', 'нет'];

/** Допустимые значения «Статус». */
export const questionStatuses = { open: 'открыт', solved: 'решён', outOfScope: 'не входит' };

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
  /** Документ задачи есть, но не читается; сервер при этом продолжает работу. @param {string} file */
  unreadable: (file) => `Не удалось прочитать ${code(file)}: это не файл или нет прав на чтение.`,
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
  /** Открытые вопросы, кроме «Блокирует: нет», в порядке записей. @param {string[]} numbers */
  blockingQuestions: (numbers) => `Блокируют подготовку требований: ${numbers.map(code).join(', ')}.\n\n`
    + 'Дальше: продолжить обсуждение. Требования — после ответа на эти вопросы.',
  /** Блокирующих вопросов нет: переход к требованиям доступен. @param {string} task */
  readyForSpec: (task) => 'Дальше: продолжить обсуждение. Когда вопросов не останется — предложить подготовить требования.\n\n'
    + `Подготовить требования в новой сессии (рекомендуется): \`/clear\` или перезапуск окна, затем ${code(`/sf-spec ${task}`)}. `
    + 'Или продолжить в этой сессии.',
  otherTask: 'Другая задача — `/sf-grill` с описанием идеи.',
  /**
   * Последняя строка ответа, без оформления: по ней GigaCode подставит команду в строку ввода.
   * Только вместе с переходом; при блокирующих вопросах и выборе задачи её нет.
   * @param {string} command
   */
  tip: (command) => `Tip: Введите ${command} чтобы продолжить`,
  /** Путь из «Источников», которого нет. @param {string} path */
  missingSource: (path) => `${code(path)} — нет такого файла или папки`,
  /** Источник из подраздела «Не изучено». @param {Source} item */
  failedSource: (item) => `${source(item)} — не открылся при изучении`,
  /** @param {string[]} lines */
  unavailableSources: (lines) => `**Недоступные источники**\n\n${list(lines)}\n\n`
    + 'Дальше: решить — продолжить без них или сделать их доступными. '
    + 'Без них — записать решение `D-…` и убрать их из «Источников» в `brainstorming.md`. '
    + 'Доступ восстановлен — убрать их из «Не изучено» в `_work/context.md` и снова вызвать `status`.',
  /** @param {string} task @param {Source[]} sources */
  studyTask: (task, sources) => [
    '**Задание на изучение источников**',
    `Прочитай ${code(`docs/${task}/brainstorming.md`)} — запрос и решения задачи. Изучи источники:`,
    list(sources.map(source)),
    `Запиши результат в ${code(`docs/${task}/_work/context.md`)}. `
      + `Файла нет — создай с заголовками ${contextHeadings.map(code).join(', ')} в этом порядке. `
      + 'Файл есть — дописывай под его заголовки, прежнее не удаляй.',
    list([
      'Каждый источник запиши так, как он записан выше: открылся — в «Изучено», не открылся — в «Не изучено» с причиной.',
      'Сведения, относящиеся к задаче, — в «Факты», у каждого факта — источник. Чего для задачи нет в источниках — в «Не найдено».',
      'Решений не принимай, другие файлы не меняй.',
      `В конце вызови \`spec_forge\` с действием \`check\` и задачей ${code(task)}, исправь ошибки.`
    ]),
    'Дальше: поручить задание отдельному агенту, добавив, что нужно выяснить. Вопросы, не зависящие от источников, задавать сразу.'
  ].join('\n\n'),

  // check. Ошибки — по файлам: brainstorming.md, questions.md, _work/context.md. Внутри файла сначала
  // разделы (нет, повторяется) в порядке образца, затем сверху вниз; внутри записи — заголовок, поля
  // в порядке образца, связь с другим файлом, ссылки.

  /** Следующие свободные номера: D, затем Q. @param {string[]} numbers */
  noErrors: (numbers) => `Ошибок нет. ${next(numbers)}`,
  /** Строки «где — что» и следующие номера. @param {string[]} lines @param {string[]} numbers */
  errors: (lines, numbers) => `**Ошибки**\n\n${list(lines)}\n\n${next(numbers)}`,
  /** @param {string} file @param {string} heading */
  missingHeading: (file, heading) => `${code(file)} — нет заголовка ${code(heading)}`,
  /** @param {string} file @param {string} heading */
  repeatedHeading: (file, heading) => `${code(file)} — заголовок ${code(heading)} повторяется`,
  /** Непустая строка «Источников» — не пункт «- », начинающийся с источника. @param {string} file @param {string} line без отступов по краям */
  badSourceLine: (file, line) => `${code(file)} — в «Источниках» строка «${line}» не начинается с пути в обратных апострофах или со ссылки`,
  /** @param {string} file @param {string} heading */
  sourceSubheading: (file, heading) => `${code(file)} — в «Источниках» подзаголовок ${code(heading)}: пункты под ним не считаются источниками`,
  /** Заголовок там, где должны быть только записи. @param {string} file @param {string} heading @param {'D' | 'Q'} kind */
  badRecordHeading: (file, heading, kind) => `${code(file)} — заголовок ${code(heading)}: нужен только номер записи, например ${code(`### ${kind}-01`)}`,
  /** @param {string} file @param {string} number */
  repeatedNumber: (file, number) => `${code(file)} — номер ${code(number)} повторяется`,
  /** Поля нет или оно пустое. @param {string} file @param {string} number @param {string} field */
  emptyField: (file, number, field) => `${code(file)}, ${code(number)} — не заполнено «${field}»`,
  /** Поле из договора записано больше одного раза. @param {string} file @param {string} number @param {string} field */
  repeatedField: (file, number, field) => `${code(file)}, ${code(number)} — «${field}» повторяется`,
  /** @param {string} file @param {string} number @param {string} field @param {string} value @param {string[]} allowed */
  badValue: (file, number, field, value, allowed) => `${code(file)}, ${code(number)} — «${field}»: ${code(value)} не подходит, `
    + `допустимо ${allowed.map(code).join(', ')}`,
  /** Решённый вопрос, на который не ссылается ни одно решение. @param {string} file @param {string} number */
  noDecision: (file, number) => `${code(file)}, ${code(number)} — вопрос решён, но ни одно решение \`D-…\` на него не ссылается`,
  /** Вопрос «не входит» не упомянут в «Не входит в задачу». @param {string} file @param {string} number */
  notOutOfScope: (file, number) => `${code(file)}, ${code(number)} — вопрос не входит в задачу, `
    + 'но не упомянут в «Не входит в задачу» `brainstorming.md`',
  /** Номер D или Q, которого нет, в записи. @param {string} file @param {string} record @param {string} number */
  deadReferenceInRecord: (file, record, number) => `${code(file)}, ${code(record)} — нет записи ${code(number)}`,
  /** Номер D или Q, которого нет, в разделе вне записей. @param {string} file @param {string} heading заголовок раздела @param {string} number */
  deadReferenceInSection: (file, heading, number) => `${code(file)}, «${heading.replace(/^#+ /, '')}» — нет записи ${code(number)}`
};
