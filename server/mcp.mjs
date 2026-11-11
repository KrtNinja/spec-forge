// @ts-check
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { check } from './check.mjs';
import { tool } from './contract.mjs';
import { texts } from './texts.mjs';
import { Unreadable } from './docs.mjs';
import { link } from './link.mjs';
import { status } from './status.mjs';

const manifest = JSON.parse(readFileSync(new URL('../gigacode-extension.json', import.meta.url), 'utf8'));
const versions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

/** Действия spec_forge. Ответ — текст или `error`: вызов не удался (isError). */
const actions = { status, check, link };

/** @param {unknown} value @returns {Record<string, unknown>} */
function object(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  return /** @type {Record<string, unknown>} */ (value);
}

// Значения запроса — любой JSON. Объект нельзя преобразовывать в строку: его `toString` может быть
// любым, и преобразование уронит сервер. Поэтому сначала тип.

/** Строковое поле вызова; другого типа — пусто. @param {unknown} value */
const field = (value) => (typeof value === 'string' ? value : '');

/** Значение для текста ответа; не строка — в записи JSON. @param {unknown} value */
const shown = (value) => (typeof value === 'string' ? value : String(JSON.stringify(value)));

/** @param {number} code @param {string} message */
function failure(code, message) {
  return { error: { code, message } };
}

/** @param {Record<string, unknown>} params */
function initialize(params) {
  const requested = params.protocolVersion;
  const protocolVersion = typeof requested === 'string' && versions.includes(requested) ? requested : versions[0];
  return {
    result: {
      protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: manifest.name, version: manifest.version }
    }
  };
}

/** @param {string} text @param {boolean} isError */
function answer(text, isError) {
  return { result: { content: [{ type: 'text', text }], isError } };
}

/** @param {Record<string, unknown>} params */
function callTool(params) {
  if (params.name !== tool.name) return failure(-32602, texts.unknownTool(shown(params.name)));
  const args = object(params.arguments);
  const call = { action: field(args.action), command: field(args.command), task: field(args.task) };
  if (!tool.inputSchema.properties.action.enum.includes(call.action)) return answer(texts.noAction, true);
  try {
    const result = actions[/** @type {keyof typeof actions} */ (call.action)](call);
    return typeof result === 'string' ? answer(result, false) : answer(result.error, true);
  } catch (error) {
    // Нечитаемый документ — ответ с ошибкой; прочие исключения — ошибки самого сервера.
    if (error instanceof Unreadable) return answer(error.message, true);
    throw error;
  }
}

/** @param {Record<string, unknown>} request */
function dispatch(request) {
  const params = object(request.params);
  switch (request.method) {
    case 'initialize': return initialize(params);
    case 'ping': return { result: {} };
    case 'tools/list': return { result: { tools: [tool] } };
    case 'tools/call': return callTool(params);
    default: return failure(-32601, texts.unknownMethod(shown(request.method)));
  }
}

/** @param {unknown} id @param {object} response */
function reply(id, response) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, ...response })}\n`);
}

/** @param {string} line */
function receive(line) {
  let request;
  try {
    request = object(JSON.parse(line));
  } catch {
    reply(null, failure(-32700, texts.badJson));
    return;
  }
  if (request.id === undefined) return;
  reply(request.id, dispatch(request));
}

// Ответ отправляется сразу после строки; закрытие ввода завершает процесс естественно.
createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', receive);
