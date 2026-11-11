// @ts-check
// Договор инструмента spec_forge: описание и схема, которые видит модель, и форматы документов задачи,
// по которым check их проверяет. Тексты ответов — в texts.mjs. Оба файла меняются только в PR критериев.

/** Источник из раздела «Источники» в brainstorming.md: путь или ссылка. @typedef {{ path: string } | { link: string }} Source */

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

/** Разделы spec.md в порядке образца; каждый ровно один раз. */
export const requirementsHeading = '## Требования';
export const specHeadings = ['## Цель', requirementsHeading, outOfScopeHeading];

// Записи. Заголовок записи — только номер, например `### D-07`: две цифры и больше, без лишних нулей впереди.
// Решения D — под «Решениями» brainstorming.md, вопросы Q — в questions.md, требования FR — под «Требованиями»
// spec.md, замечания R — в _work/review.md. Поле записи — пункт «- Поле: значение», каждое поле из договора —
// не больше одного раза.

/** Поле решения D, которое должно быть заполнено: решение пользователя. */
export const decisionField = 'Решение';

/** Поле заменённого решения D: номер решения, которое его заменило. Заполнено — решение заменено. */
export const replacedField = 'Заменено';

/** Поля требования FR в порядке образца; оба обязательны. «Основание» — номера решений D через запятую. */
export const requirementFields = { example: 'Пример', basis: 'Основание' };

// Строка статуса spec.md — строка вне блоков кода, которая начинается со «Статус:»; ровно одна, пробелы в конце
// не учитываются. Сумма — первые шесть знаков SHA-256
// текста spec.md без строки статуса, приведённого к одному виду: переводы строк LF, без пробелов в конце строк
// и без пустых строк в конце. Дата — сегодняшняя по часам компьютера, ГГГГ-ММ-ДД.

/** Начало строки статуса: по нему строка находится, в том числе неверная. */
export const statusPrefix = 'Статус:';
export const draftStatus = 'Статус: черновик';
/** @param {string} date @param {string} sum */
export const approvedStatus = (date, sum) => `Статус: одобрено ${date} · ${sum}`;
/** Строка одобрения: дата и сумма. */
export const approvedPattern = /^Статус: одобрено (\d{4}-\d{2}-\d{2}) · ([0-9a-f]{6})$/;

/** Предел spec.md в буквах и цифрах; больше — предупреждение, а не ошибка. */
export const specLimit = 10000;

/** Поля вопроса Q в порядке образца. */
export const questionFields = { stage: 'Этап', blocking: 'Блокирует', help: 'Помощь', status: 'Статус', answer: 'Ответ' };

/** Допустимые значения «Блокирует». Значения «Этап» — команды из схемы инструмента. */
export const blockingValues = ['да', 'нет'];

/** Допустимые значения «Статус». */
export const questionStatuses = { open: 'открыт', solved: 'решён', outOfScope: 'не входит' };

// _work/review.md: каждая проверка дописывает в конец раздел второго уровня с замечаниями `### R-07`, нумерация
// сквозная по файлу. Переходы и одобрение — по последнему разделу: после последнего заголовка первого или второго
// уровня, а без них — весь файл. Записи R — заголовки третьего уровня и ниже.

/** Поля замечания R в порядке образца; все, кроме «Решения», обязательны. Пустое «Решение» — замечание не разобрано. */
export const remarkFields = { importance: 'Важность', place: 'Где', problem: 'Проблема', advice: 'Рекомендация', decision: 'Решение' };

/** Допустимые значения «Важности». */
export const remarkImportance = { blocking: 'блокирует', note: 'замечание' };

/** Допустимые значения «Решения» (FR-19). Отложенное замечание называет вопрос `Q-…` в questions.md. */
export const remarkDecisions = { accepted: 'принято', own: 'своё решение', postponed: 'отложено', rejected: 'отклонено' };

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
          + 'Для status — существующая задача или имя новой; не указано — status подберёт задачу сам. Для check и link обязательно.'
      },
      command: {
        type: 'string',
        enum: ['sf-grill', 'sf-spec', 'sf-review', 'sf-note'],
        description: 'Для status: команда, с которой начата работа.'
      },
      touched: {
        type: 'boolean',
        description: 'Для status с командой sf-review: в этой сессии ты готовил, правил или проверял spec.md этой задачи.'
      },
      agent: {
        type: 'boolean',
        description: 'Для status с командой sf-review: ты можешь поручить работу отдельному агенту.'
      }
    },
    required: ['action']
  }
};
