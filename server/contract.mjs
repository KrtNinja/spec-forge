// @ts-check
// Договор инструмента spec_forge: описание и схема, которые видит модель,
// и все тексты ответов, которые видит пользователь. Меняется только в PR критериев.

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
      }
    },
    required: ['action']
  }
};

export const texts = {
  /** @param {string} action */
  notImplemented: (action) => `Действие \`${action}\` пока не реализовано.`,
  noAction: 'Укажите действие: `status`, `check` или `link`.',
  /** @param {string} name */
  unknownTool: (name) => `Неизвестный инструмент \`${name}\`.`,
  /** @param {string} method */
  unknownMethod: (method) => `Неизвестный метод \`${method}\`.`,
  badJson: 'Не удалось разобрать сообщение: ожидался JSON.'
};
