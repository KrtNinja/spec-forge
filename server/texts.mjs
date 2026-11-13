// @ts-check
// Все тексты ответов spec_forge, которые видит пользователь. Меняются только в PR критериев, как и договор.
// Ответ собирается из этих текстов: абзацы разделяются пустой строкой.
import { contextHeadings, draftStatus, specLimit } from './contract.mjs';

const nextStep = '**Дальше:**';

/** @typedef {import('./contract.mjs').Source} Source */

/** @param {string} value */
const code = (value) => `\`${value}\``;

/** @param {string[]} items */
const list = (items) => items.map((item) => `- ${item}`).join('\n');

/** @param {string[]} values */
const codes = (values) => values.map(code).join(', ');

/** @param {string[]} numbers */
const next = (numbers) => `Следующие номера: ${codes(numbers)}.`;

/** Ссылка Markdown на файл от корня проекта: имя файла — текстом. @param {string} path */
const fileLink = (path) => `[${path.slice(path.lastIndexOf('/') + 1)}](${path})`;

/** Путь — кодом, ссылка — как есть. @param {Source} item */
const source = (item) => ('path' in item ? code(item.path) : item.link);

/** Число с пробелами между разрядами: 10 001. @param {number} value */
const grouped = (value) => String(value).replace(/\B(?=(\d{3})+$)/g, ' ');

/**
 * Где найдено: в записи — её номер, вне записей — заголовок раздела без знаков `#`.
 * @param {string} file @param {string} place номер записи или заголовок раздела целиком
 */
const where = (file, place) => (place.startsWith('#') ? `${code(file)}, «${place.replace(/^#+ /, '')}»` : `${code(file)}, ${code(place)}`);

/** @param {string} task */
const reviewCommand = (task) => code(`/sf-review ${task}`);

/** Что мешает одобрению; хоть один список не пуст. @param {string[]} questions открытые @param {string[]} remarks блокирующие замечания */
const blocked = (questions, remarks) => `**Одобрить нельзя** — ${[
  ...(questions.length === 0 ? [] : [`открытые вопросы: ${codes(questions)}`]),
  ...(remarks.length === 0 ? [] : [`блокирующие замечания: ${codes(remarks)}`])
].join('; ')}.`;

/** Состояние и препятствия одобрению, если они есть. @param {string} state @param {string[]} questions @param {string[]} remarks */
const ready = (state, questions, remarks) => (questions.length + remarks.length === 0 ? state : `${state} ${blocked(questions, remarks)}`);

/**
 * Вариант проверки ИИ с путём и что предложить рядом: открыты вопросы — разобрать их; одни отложенные блокирующие
 * замечания — ничего, их снимает только новая проверка; иначе — одобрить.
 * @param {string} option @param {string} way @param {string} task @param {string[]} questions @param {string[]} remarks
 */
function choice(option, way, task, questions, remarks) {
  if (questions.length > 0) {
    return `${option} — ${way} — или разобрать открытые вопросы. Ответ бизнеса или разработчика — через ${code(`/sf-note ${task}`)}.`;
  }
  return remarks.length > 0 ? `${option} — ${way}.` : `${option} — ${way} — или «Одобрить» строкой из \`check\`.`;
}

export const texts = {
  // Вызов не удался (isError).
  noAction: 'Укажите действие: `status`, `check` или `link`.',
  noCommand: 'Укажите команду: `sf-grill`, `sf-spec`, `sf-review` или `sf-note`.',
  /** sf-review без обоих признаков пути проверки; не логическое значение — как нет признака. */
  noReviewFlags: 'Для `sf-review` укажите `touched` — готовился, правился или проверялся ли `spec.md` этой задачи в этой сессии, '
    + 'в том числе в `sf-spec` или `sf-note`, — и `agent` — есть ли у тебя инструмент запуска отдельного агента.',
  /** Для check поле affected есть, но это не список. */
  badAffected: 'Укажите `affected` списком номеров решений и вопросов, например `["D-03", "Q-02"]`.',
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
    + `${nextStep} выслушать идею и выбрать имя папки — своё, например принятое в команде, или предложенное агентом латиницей. `
    + 'Затем `status` с этим именем.',
  /** @param {string[]} tasks */
  chooseTask: (tasks) => `Незаконченных обсуждений несколько:\n\n${list(tasks.map(code))}\n\n`
    + `${nextStep} выбрать одну из них или начать новую задачу, затем \`status\` с её именем.`,
  /** @param {string} name */
  cyrillicName: (name) => `Имя папки ${code(name)} написано кириллицей.\n\n${nextStep} попросить имя латиницей.`,
  /** @param {string} name */
  badName: (name) => `Имя папки ${code(name)} не подходит: нужны латинские буквы, цифры, \`-\`, \`_\` и \`.\`, `
    + `первый знак — буква или цифра, без пути \`docs/\`.\n\n${nextStep} исправить имя.`,
  /** @param {string} name */
  folderTaken: (name) => `Папка ${code(`docs/${name}/`)} уже есть, но это не задача Spec Forge: в ней нет \`brainstorming.md\`.\n\n`
    + `${nextStep} выбрать другое имя.`,
  /** @param {string} name */
  newTask: (name) => `Новая задача ${code(name)}.\n\n`
    + `${nextStep} создать ${code(`docs/${name}/brainstorming.md`)} с запросом и источниками, затем снова \`status\` с этой задачей.`,

  // status: обсуждение и источники.
  /** @param {string} task */
  discussion: (task) => `Задача ${code(task)}: обсуждение, требований ещё нет.`,
  /** Открытые вопросы, кроме «Блокирует: нет», в порядке записей. @param {string[]} numbers */
  blockingQuestions: (numbers) => `Блокируют подготовку требований: ${codes(numbers)}.\n\n`
    + `${nextStep} продолжить обсуждение. Требования — после ответа на эти вопросы.`,
  /** Блокирующих вопросов нет: переход к требованиям доступен. @param {string} task */
  readyForSpec: (task) => `${nextStep} продолжить обсуждение. Когда обсуждение завершено — предложить подготовить требования. Неблокирующие вопросы могут оставаться открытыми.\n\n`
    + `Подготовить требования в новой сессии (рекомендуется): \`/clear\` или перезапуск окна, затем ${code(`/sf-spec ${task}`)}. `
    + 'Или продолжить в этой сессии.',
  otherTask: 'Другая задача — `/sf-grill` с описанием идеи.',
  /**
   * Последняя строка ответа: метка жирным, команда кодом; GigaCode подставляет её в строку ввода.
   * Только вместе с переходом; при блокирующих вопросах и выборе задачи её нет.
   * @param {string} command
   */
  tip: (command) => `**Tip:** Введите ${code(command)} чтобы продолжить`,
  /** Путь из «Источников», которого нет. @param {string} path */
  missingSource: (path) => `${code(path)} — нет такого файла или папки`,
  /** Источник из подраздела «Не изучено». @param {Source} item */
  failedSource: (item) => `${source(item)} — не открылся при изучении`,
  /** @param {string[]} lines */
  unavailableSources: (lines) => `**Недоступные источники**\n\n${list(lines)}\n\n`
    + `${nextStep} решить — продолжить без них или сделать их доступными. `
    + 'Без них — записать решение `D-…` и убрать их из «Источников» в `brainstorming.md`. '
    + 'Доступ восстановлен — убрать их из «Не изучено» в `_work/context.md` и снова вызвать `status`.',
  /** @param {string} task @param {Source[]} sources */
  studyTask: (task, sources) => [
    '**Задание на изучение источников**',
    `Прочитай ${code(`docs/${task}/brainstorming.md`)} — запрос и решения задачи. Изучи источники:`,
    list(sources.map(source)),
    `Запиши результат в ${code(`docs/${task}/_work/context.md`)}. `
      + `Файла нет — создай с заголовками ${codes(contextHeadings)} в этом порядке. `
      + 'Файл есть — дописывай под его заголовки, прежнее не удаляй.',
    list([
      'Каждый источник запиши так, как он записан выше: открылся — в «Изучено», не открылся — в «Не изучено» с причиной.',
      'Сведения, относящиеся к задаче, — в «Факты», у каждого факта — источник. Чего для задачи нет в источниках — в «Не найдено».',
      'Решений не принимай, другие файлы не меняй.',
      `В конце вызови \`spec_forge\` с действием \`check\` и задачей ${code(task)}, исправь ошибки.`
    ]),
    `${nextStep} поручить задание отдельному агенту, добавив, что нужно выяснить. Вопросы, не зависящие от источников, задавать сразу.`
  ].join('\n\n'),
  /** sf-grill для задачи со spec.md, ещё не одобренной; дальше строка Tip с /sf-spec. @param {string} task */
  discussionDone: (task) => `Задача ${code(task)}: обсуждение закончено, требования — в \`spec.md\`.\n\n`
    + `${nextStep} работа с требованиями — ${code(`/sf-spec ${task}`)}.`,

  // status: требования. Для sf-spec подходит задача, ещё не одобренная; новую задачу sf-spec не начинает.
  /** Названной задачи нет; и для sf-review. @param {string} task */
  noSuchTask: (task) => `Задачи ${code(task)} нет: не найден ${code(`docs/${task}/brainstorming.md`)}.\n\n`
    + `${nextStep} выбрать существующую задачу или начать новую — \`/sf-grill\` с описанием идеи.`,
  noSpecTasks: `Задач без одобренных требований нет.\n\n${nextStep} начать новую задачу — \`/sf-grill\` с описанием идеи.`,
  /** @param {string[]} tasks */
  chooseSpecTask: (tasks) => `Задач без одобренных требований несколько:\n\n${list(tasks.map(code))}\n\n`
    + `${nextStep} выбрать одну из них, затем \`status\` с её именем.`,
  /** spec.md нет, а источники не изучены или вопросы блокируют; дальше строка Tip с /sf-grill. @param {string} task @param {string} reason */
  tooEarly: (task, reason) => `Задача ${code(task)}: требований ещё нет, обсуждение не закончено — ${reason}.\n\n`
    + `${nextStep} продолжить обсуждение — ${code(`/sf-grill ${task}`)}.`,
  /** Причина для tooEarly: есть неизученные или недоступные источники. */
  sourcesPending: 'не все источники изучены',
  /** Причина для tooEarly. @param {string[]} numbers */
  blockedBy: (numbers) => `подготовку требований блокируют ${codes(numbers)}`,
  /** @param {string} task */
  writeSpec: (task) => `Задача ${code(task)}: подготовка требований, \`spec.md\` ещё нет.\n\n`
    + `${nextStep} подготовить ${code(`docs/${task}/spec.md`)} по решениям из \`brainstorming.md\`.`,
  /** У check есть ошибки в любом документе задачи. @param {string} task */
  specErrors: (task) => `Задача ${code(task)}: требования в \`spec.md\`, есть ошибки проверки.\n\n`
    + `${nextStep} вызвать \`check\` и исправить ошибки.`,
  /**
   * sf-spec, проверки ИИ ещё не было: проверка ИИ (рекомендуется) или одобрение (FR-16). Путь проверки выберет sf-review.
   * @param {string} task @param {string[]} questions открытые вопросы
   */
  specReady: (task, questions) => `${ready(`Задача ${code(task)}: требования в \`spec.md\`, проверки пройдены.`, questions, [])}\n\n`
    + `${nextStep} предложить ${choice('«Проверить требования» (рекомендуется)', reviewCommand(task), task, questions, [])}`,

  // status: одобренная задача. Все команды отвечают одинаково.
  /** Одобрено, сумма совпадает, препятствий одобрению нет. @param {string} task */
  specApproved: (task) => `Задача ${code(task)}: требования одобрены, работа завершена.\n\nНовые сведения — ${code(`/sf-note ${task}`)}.`,
  /** Одобрено, но мешают блокирующие замечания последнего раздела review.md; раньше вопросов. @param {string} task @param {string[]} remarks */
  approvedRemarks: (task, remarks) => `Задача ${code(task)}: требования одобрены, но в последней проверке блокирующие замечания: `
    + `${codes(remarks)} — одобрение не действует.\n\n`
    + `${nextStep} поставить «${draftStatus}» и продолжить с замечаниями — ${reviewCommand(task)}.`,
  /** Одобрено, но открыты вопросы. @param {string} task @param {string[]} questions */
  approvedQuestions: (task, questions) => `Задача ${code(task)}: требования одобрены, но одобрение не подтверждено — `
    + `открытые вопросы: ${codes(questions)}.\n\n${nextStep} ответ — через ${code(`/sf-note ${task}`)}. `
    + `Меняет смысл требований — поставить «${draftStatus}», поправить \`spec.md\` и одобрить заново.`,
  /** Одобрено, но сумма не совпадает: одобрение не действует, что бы ни изменилось (FR-24). @param {string} task */
  approvedChanged: (task) => `Задача ${code(task)}: \`spec.md\` изменён после одобрения — одобрение не действует.\n\n`
    + `${nextStep} поставить «${draftStatus}» — нужно повторное одобрение.`,

  // status: sf-note. Подходит любая задача, включая одобренные; ответ — как у команды этапа задачи.
  noTasks: `Задач нет.\n\n${nextStep} начать новую задачу — \`/sf-grill\` с описанием идеи.`,
  /** @param {string[]} tasks */
  chooseAnyTask: (tasks) => `Задач несколько:\n\n${list(tasks.map(code))}\n\n`
    + `${nextStep} выбрать ту, к которой относятся сведения, затем \`status\` с её именем.`,

  // status: проверка требований. Для sf-review подходит задача со spec.md, ещё не одобренная. Строки замечаний и после
  // проверки — общие для sf-spec и sf-review, различается путь: у sf-spec — команда, у sf-review — по touched и agent;
  // при touched — нет и разобранной проверке — сразу reviewStart. С путём «отдельным агентом» ниже идёт задание, «в новой сессии» — Tip.
  /** Путь для sf-spec: путь выберет sf-review. */
  reviewCommand,
  /** touched — нет: контекст чистый. */
  reviewHere: 'здесь, в этой сессии',
  /** touched и agent — да. */
  reviewByAgent: 'отдельным агентом по заданию ниже',
  /** touched — да, agent — нет: в этой сессии проверка не предлагается (FR-17). @param {string} task */
  reviewInNewSession: (task) => `в новой сессии: \`/clear\` или перезапуск окна, затем ${reviewCommand(task)}`,
  /** Задание отдельному агенту: проверка по скиллу, без status и без разбора. @param {string} task */
  reviewTask: (task) => `**Задание на проверку**\n\nЗагрузи скилл \`sf-review\` и проверь требования задачи ${code(task)} `
    + 'по его разделу «Проверка». `status` не вызывай. После `check` без ошибок закончи работу: '
    + 'замечания разберёт основной агент с пользователем.',
  noReviewTasks: 'Задач с неодобренными требованиями в `spec.md` нет.\n\n'
    + `${nextStep} подготовить требования — \`/sf-spec\` — или начать новую задачу — \`/sf-grill\` с описанием идеи.`,
  /** @param {string[]} tasks */
  chooseReviewTask: (tasks) => `Задач с неодобренными требованиями в \`spec.md\` несколько:\n\n${list(tasks.map(code))}\n\n`
    + `${nextStep} выбрать одну из них, затем \`status\` с её именем.`,
  /** Названная задача без spec.md; дальше строка Tip с /sf-spec. @param {string} task */
  noSpecYet: (task) => `Задача ${code(task)}: требований в \`spec.md\` ещё нет — проверять нечего.\n\n`
    + `${nextStep} подготовить требования — ${code(`/sf-spec ${task}`)}.`,
  /** sf-review, проверку уже выбрали: её не было или, при touched — нет, всё разобрано. @param {string} task @param {string} way @param {string[]} questions @param {string[]} remarks */
  reviewStart: (task, way, questions, remarks) => `${ready(`Задача ${code(task)}: требования в \`spec.md\` готовы к проверке.`,
    questions, remarks)}\n\n${nextStep} проверить требования — ${way}.`,
  /** В последнем разделе review.md блокирующие замечания без решения (FR-18). @param {string} task @param {string[]} numbers */
  remarksBlocking: (task, numbers) => `Задача ${code(task)}: требования в \`spec.md\`, проверки пройдены. `
    + `Блокирующие замечания проверки без решения: ${codes(numbers)}.\n\n`
    + `${nextStep} разобрать их с пользователем по одному — ${reviewCommand(task)}.`,
  /**
   * В последнем разделе есть замечания без решения, блокирующих среди них нет (FR-18, FR-20).
   * @param {string} task @param {string[]} numbers @param {string} way @param {string[]} questions @param {string[]} remarks отложенные блокирующие
   */
  remarksOpen: (task, numbers, way, questions, remarks) => `${ready(`Задача ${code(task)}: требования в \`spec.md\`, `
    + `проверки пройдены. Замечания проверки без решения: ${codes(numbers)}.`, questions, remarks)}\n\n`
    + `${nextStep} предложить разобрать все, выбранные или отклонить их. `
    + `Без рекомендации — ${choice('«Повторить проверку требований»', way, task, questions, remarks)}`,
  /**
   * У всех замечаний последнего раздела есть решение (FR-20).
   * @param {string} task @param {string} way @param {string[]} questions @param {string[]} remarks отложенные блокирующие
   */
  reviewDone: (task, way, questions, remarks) => `${ready(`Задача ${code(task)}: требования в \`spec.md\`, проверки пройдены, `
    + 'замечаний проверки без решения нет.', questions, remarks)}\n\n`
    + `${nextStep} предложить ${choice('«Повторить проверку требований»', way, task, questions, remarks)}`,

  // check. Ошибки — по файлам: brainstorming.md, questions.md, spec.md, _work/review.md, _work/context.md. Внутри
  // файла сначала разделы (нет, повторяется) в порядке образца, у spec.md затем строка статуса, дальше сверху вниз;
  // внутри записи — заголовок, поля в порядке образца, связь с другим файлом, упоминания номеров, ссылки Markdown.
  // Есть spec.md — после строки номеров абзацами: предупреждение о размере, затем, если ошибок нет, одобрение.
  /** Следующие свободные номера: D, Q, если есть spec.md — FR, если есть _work/review.md — R. @param {string[]} numbers */
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
  /** Заголовок там, где должны быть только записи. @param {string} file @param {string} heading @param {'D' | 'Q' | 'FR' | 'R'} kind */
  badRecordHeading: (file, heading, kind) => `${code(file)} — заголовок ${code(heading)}: нужен только номер записи, например ${code(`### ${kind}-01`)}`,
  /** @param {string} file @param {string} number */
  repeatedNumber: (file, number) => `${code(file)} — номер ${code(number)} повторяется`,
  /** Поля нет или оно пустое. @param {string} file @param {string} number @param {string} field */
  emptyField: (file, number, field) => `${code(file)}, ${code(number)} — не заполнено «${field}»`,
  /** Поле из договора записано больше одного раза. @param {string} file @param {string} number @param {string} field */
  repeatedField: (file, number, field) => `${code(file)}, ${code(number)} — «${field}» повторяется`,
  /** @param {string} file @param {string} number @param {string} field @param {string} value @param {string[]} allowed */
  badValue: (file, number, field, value, allowed) => `${code(file)}, ${code(number)} — «${field}»: ${code(value)} не подходит, `
    + `допустимо ${codes(allowed)}`,
  /** Пункт «- Имя: …» после первого поля образца вопроса, но имени нет в образце. @param {string} file @param {string} number @param {string} field */
  unknownField: (file, number, field) => `${code(file)}, ${code(number)} — поле «${field}» не из образца вопроса`,
  /** Решённый вопрос, на который не ссылается ни одно решение. @param {string} file @param {string} number */
  noDecision: (file, number) => `${code(file)}, ${code(number)} — вопрос решён, но ни одно решение \`D-…\` на него не ссылается`,
  /** Вопрос «не входит» не упомянут в «Не входит в задачу». @param {string} file @param {string} number */
  notOutOfScope: (file, number) => `${code(file)}, ${code(number)} — вопрос не входит в задачу, `
    + 'но не упомянут в «Не входит в задачу» `brainstorming.md`',
  /** Отложенное замечание, которого не называет ни один вопрос (FR-19). @param {string} file @param {string} number */
  noQuestion: (file, number) => `${code(file)}, ${code(number)} — замечание отложено, но ни один вопрос \`Q-…\` его не называет`,
  /**
   * Упомянут номер, которого нет среди записей; в _work/review.md номер FR — не ошибка: требование могли удалить.
   * @param {string} file @param {string} place номер записи или заголовок раздела @param {string} number
   */
  deadReference: (file, place, number) => `${where(file, place)} — нет записи ${code(number)}`,
  /**
   * Ссылка Markdown на файл, которого нет, или на запись, которой нет в этом файле. Внешние адреса не проверяются.
   * @param {string} file @param {string} place @param {string} target адрес ссылки как записан
   */
  deadLink: (file, place, target) => `${where(file, place)} — ссылка ${code(target)} ведёт в тупик`,
  /**
   * Текст ссылки — номер записи, а адрес — не её место в документе задачи.
   * @param {string} file @param {string} place @param {string} number @param {string} target адрес ссылки как записан
   */
  wrongLink: (file, place, number, target) => `${where(file, place)} — ссылка ${code(number)} ведёт на ${code(target)}, `
    + 'а не на свою запись: исправит `link`',
  /** Текст ссылки — не номер, якорь записи заглавными, а запись в этом файле есть. @param {string} file @param {string} place @param {string} target */
  anchorCase: (file, place, target) => `${where(file, place)} — в ссылке ${code(target)} якорь записи заглавными: исправит \`link\``,
  /** @param {string} file */
  noStatusLine: (file) => `${code(file)} — нет строки статуса, например «${draftStatus}»`,
  /** @param {string} file */
  repeatedStatusLine: (file) => `${code(file)} — строка статуса повторяется`,
  /** @param {string} file @param {string} line без пробелов в конце */
  badStatusLine: (file, line) => `${code(file)} — строка статуса «${line}» не подходит: `
    + `нужна «${draftStatus}» или строка одобрения из ответа \`check\``,
  /** @param {string} file @param {string} number */
  noBasisDecision: (file, number) => `${where(file, number)} — в «Основании» нет номера решения \`D-…\``,
  /** @param {string} file @param {string} number @param {string} decision */
  replacedBasis: (file, number, decision) => `${where(file, number)} — основание ${code(decision)} заменено другим решением`,

  /** Не ошибка: проверки и одобрение не останавливает. @param {string} file @param {number} count буквы и цифры */
  bigSpec: (file, count) => `**Предупреждение:** в ${code(file)} больше ${grouped(specLimit)} букв и цифр — ${grouped(count)}. `
    + 'Документ разросся: возможно, задачу стоит разделить.',
  /** Условия одобрения выполнены. @param {string} file @param {string} line готовая строка статуса */
  approvalReady: (file, line) => 'Условия одобрения выполнены. Одобрить — только по явному решению пользователя: '
    + `заменить строку статуса в ${code(file)} строкой ниже и снова вызвать \`check\`.\n\n${line}`,
  /**
   * Ошибок нет, но открыты вопросы или в последнем разделе _work/review.md блокирующие замечания без решения или
   * отложенные — и у черновика, и у строки одобрения: одобрение не подтверждается.
   */
  approvalBlocked: blocked,
  /**
   * Одобрено, сумма совпадает, препятствий одобрению нет (FR-22): ссылки на документы, а не пути.
   * @param {string} spec @param {string} questions нет questions.md — пусто
   */
  approved: (spec, questions) => `Документ с требованиями одобрен: ${fileLink(spec)}.`
    + (questions === '' ? '' : `\n\nВопросы и ответы: ${fileLink(questions)}.`)
    + `\n\n${nextStep} предложить закоммитить папку задачи ${code(spec.slice(0, spec.lastIndexOf('/') + 1))}.`,
  /** Одобрено, но сумма не совпадает: одобрение не действует, что бы ни изменилось (FR-24). @param {string} file */
  changedAfterApproval: (file) => `${code(file)} изменён после одобрения: сумма не совпадает, одобрение не действует. `
    + `Поставить «${draftStatus}» — нужно повторное одобрение.`,

  // check с affected: после строки номеров, по пункту на номер в порядке вызова, без повторов.
  /** @param {string[]} lines */
  dependents: (lines) => `**Зависящие требования**\n\n${list(lines)}`,
  /** FR, у которых решение в «Основании»; для вопроса — через решения, которые его упоминают. @param {string} number @param {string[]} requirements */
  dependsOn: (number, requirements) => `${code(number)} — ${requirements.length === 0 ? 'требований нет' : codes(requirements)}`,
  /** Значение — не номер решения или вопроса задачи; не строка — в записи JSON. @param {string} value */
  notAffectable: (value) => `${code(value)} — нет решения или вопроса с таким номером`,

  // link. Номера D, Q, FR и R в brainstorming.md, questions.md, spec.md и _work/review.md.
  /** Ошибка записи: только файлы, успешно записанные до неё. @param {string} file @param {string[]} written */
  linkWriteFailed: (file, written) => `Не удалось записать ${code(file)}. Работа со ссылками остановлена.\n\n`
    + (written.length === 0 ? 'До ошибки ни один файл не записан.' : `До ошибки записаны: ${codes(written)}.`)
    + '\n\nПроверьте указанный файл и возможность записи, затем повторите `link`.',

  /** @param {number} added @param {number} fixed */
  linked: (added, fixed) => `Ссылок проставлено: ${added}, исправлено: ${fixed}.`,
  /** Ссылки, которые не поставить и не исправить. @param {string[]} lines */
  notLinked: (lines) => `**Не исправлено**\n\n${list(lines)}`,
  /** @param {string} file @param {string} place @param {string} number */
  ambiguousNumber: (file, place, number) => `${where(file, place)} — ${code(number)}: записей с этим номером несколько`
};
