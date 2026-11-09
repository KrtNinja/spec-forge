// @ts-check
// Обмен с сервером по MCP через стандартный ввод и вывод.
// В каждом обмене tests/server.mjs проверяет: в выводе только сообщения JSON-RPC 2.0,
// после закрытия ввода сервер сам завершается с кодом 0 не дольше чем за 2 секунды.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exchange, handshake, message, root } from './server.mjs';
import { texts, tool } from '../server/contract.mjs';

const versions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

/** @param {string[]} lines */
async function run(lines) {
  const cwd = mkdtempSync(join(tmpdir(), 'spec-forge-protocol-'));
  try {
    return await exchange(cwd, lines);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

/** @param {number} code @param {string} text @param {number | null} [id] */
function failure(code, text, id = 1) {
  return [{ jsonrpc: '2.0', id, error: { code, message: text } }];
}

test('initialize: имя и версия из манифеста, возможность tools', async () => {
  const manifest = JSON.parse(readFileSync(join(root, 'gigacode-extension.json'), 'utf8'));
  const replies = await run(handshake());
  assert.equal(replies.length, 1, 'ответ только на initialize');
  const { serverInfo, capabilities } = replies[0].result;
  assert.equal(serverInfo.name, manifest.name);
  assert.equal(serverInfo.version, manifest.version);
  assert.equal(typeof capabilities.tools, 'object');
});

for (const version of versions) {
  test(`initialize: поддерживаемая версия ${version} возвращается без изменений`, async () => {
    const [reply] = await run(handshake(version));
    assert.equal(reply.result.protocolVersion, version);
  });
}

test('initialize: неизвестная версия — ответ последней поддерживаемой', async () => {
  const [reply] = await run(handshake('1999-01-01'));
  assert.equal(reply.result.protocolVersion, versions[0]);
});

test('tools/list без initialize: ровно инструмент из договора', async () => {
  assert.deepEqual(await run([message('tools/list', {}, 1)]), [{ jsonrpc: '2.0', id: 1, result: { tools: [tool] } }]);
});

test('tools/call без initialize: ответ текстом', async () => {
  const replies = await run([message('tools/call', { name: 'spec_forge', arguments: { action: 'status' } }, 1)]);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].id, 1);
  assert.equal(replies[0].result.content[0].type, 'text');
});

test('уведомление остаётся без ответа', async () => {
  assert.deepEqual(await run([message('notifications/initialized')]), []);
});

test('ping: пустой результат', async () => {
  assert.deepEqual(await run([message('ping', undefined, 1)]), [{ jsonrpc: '2.0', id: 1, result: {} }]);
});

test('неизвестный метод: ошибка -32601', async () => {
  assert.deepEqual(await run([message('foo/bar', {}, 1)]), failure(-32601, texts.unknownMethod('foo/bar')));
});

test('неизвестный инструмент: ошибка -32602', async () => {
  const call = message('tools/call', { name: 'other', arguments: {} }, 1);
  assert.deepEqual(await run([call]), failure(-32602, texts.unknownTool('other')));
});

test('строка не JSON: ошибка -32700 без номера запроса', async () => {
  assert.deepEqual(await run(['не json']), failure(-32700, texts.badJson, null));
});

test('без запросов сервер молча завершается', async () => {
  assert.deepEqual(await run([]), []);
});
