// @ts-check
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { texts, tool } from './contract.mjs';

const manifest = JSON.parse(readFileSync(new URL('../gigacode-extension.json', import.meta.url), 'utf8'));
const versions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

/** @param {unknown} value @returns {Record<string, unknown>} */
function object(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  return /** @type {Record<string, unknown>} */ (value);
}

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

/** @param {Record<string, unknown>} params */
function callTool(params) {
  if (params.name !== tool.name) return failure(-32602, texts.unknownTool(String(params.name)));
  const action = object(params.arguments).action;
  const text = typeof action === 'string' && tool.inputSchema.properties.action.enum.includes(action)
    ? texts.notImplemented(action)
    : texts.noAction;
  return { result: { content: [{ type: 'text', text }], isError: true } };
}

/** @param {Record<string, unknown>} request */
function dispatch(request) {
  const params = object(request.params);
  switch (request.method) {
    case 'initialize': return initialize(params);
    case 'ping': return { result: {} };
    case 'tools/list': return { result: { tools: [tool] } };
    case 'tools/call': return callTool(params);
    default: return failure(-32601, texts.unknownMethod(String(request.method)));
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
