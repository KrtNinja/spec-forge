// @ts-check
// Обмен с сервером по MCP через стандартный ввод и вывод.
// В каждом обмене tests/server.mjs проверяет: в выводе только сообщения JSON-RPC 2.0,
// ответ на каждый запрос приходит при открытом вводе, после закрытия ввода
// сервер сам завершается с кодом 0 не дольше чем за 2 секунды.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exchange, handshake, message, root } from './server.mjs';
import { tool } from '../server/contract.mjs';
import { texts } from '../server/texts.mjs';

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

test('tools/call без arguments: просьба указать действие, сервер работает дальше', async () => {
  const replies = await run([message('tools/call', { name: 'spec_forge' }, 1)]);
  assert.deepEqual(replies, [
    { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: texts.noAction }], isError: true } }
  ]);
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

test('метод и имя инструмента не строки: ошибки с записью JSON, сервер продолжает работу', async () => {
  const odd = { toString: null };
  const replies = await run([
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: odd }),
    message('tools/call', { name: odd, arguments: {} }, 2),
    message('ping', {}, 3)
  ]);
  assert.deepEqual(replies, [
    ...failure(-32601, texts.unknownMethod('{"toString":null}')),
    ...failure(-32602, texts.unknownTool('{"toString":null}'), 2),
    { jsonrpc: '2.0', id: 3, result: {} }
  ]);
});

test('строка не JSON: ошибка -32700 без номера запроса', async () => {
  assert.deepEqual(await run(['не json']), failure(-32700, texts.badJson, null));
});

test('без запросов сервер молча завершается', async () => {
  assert.deepEqual(await run([]), []);
});

// FR-25, FR-28; core/design.md: Детерминированный инструмент, Ответ инструмента.
// Linux, обычный пользователь: настоящий EACCES при записи, без подмены файловых функций.
// Случай numbers задаёт ожидаемые ссылки и CRLF; ответы ошибки ниже заданы независимо от texts.
const linkCase = join(root, 'tests/mcp/link/numbers');
const linkFiles = ['brainstorming.md', 'questions.md', 'spec.md'];

/** @param {string} cwd @param {string[]} written */
function assertLinkFiles(cwd, written) {
  for (const file of linkFiles) {
    const path = join('docs/order-search', file);
    const expected = join(linkCase, written.includes(file) ? 'after' : 'before', path);
    assert.deepEqual(readFileSync(join(cwd, path)), readFileSync(expected), path);
  }
}

for (const denied of ['brainstorming.md', 'spec.md']) {
  test(`link: ошибка записи ${denied}, ping и повтор после восстановления прав в том же процессе`, async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spec-forge-write-'));
    const path = join(cwd, 'docs/order-search', denied);
    const written = denied === 'spec.md' ? ['brainstorming.md', 'questions.md'] : [];
    const prior = denied === 'spec.md'
      ? 'До ошибки записаны: `docs/order-search/brainstorming.md`, `docs/order-search/questions.md`.'
      : 'До ошибки ни один файл не записан.';
    const error = `Не удалось записать \`docs/order-search/${denied}\`. Работа со ссылками остановлена.\n\n`
      + `${prior}\n\nПроверьте указанный файл и возможность записи, затем повторите \`link\`.`;
    const call = { name: 'spec_forge', arguments: { action: 'link', task: 'order-search' } };
    try {
      cpSync(join(linkCase, 'before'), cwd, { recursive: true });
      chmodSync(path, 0o444);
      assertLinkFiles(cwd, []); // чтение доступно, содержимое ещё не менялось
      assert.throws(() => openSync(path, 'r+'), { code: 'EACCES' }, 'нужен реальный запрет записи; запускать без root');
      const replies = await exchange(cwd, [
        message('tools/call', call, 1), message('ping', {}, 2),
        message('tools/call', call, 3), message('tools/call', call, 4)
      ], (index) => {
        if (index !== 2) return;
        assertLinkFiles(cwd, written); // первый ответ и ping получены, повтор ещё не отправлен
        chmodSync(path, 0o644);
      });
      assert.deepEqual(replies, [
        { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: error }], isError: true } },
        { jsonrpc: '2.0', id: 2, result: {} },
        { jsonrpc: '2.0', id: 3, result: {
          content: [{ type: 'text', text: `Ссылок проставлено: ${denied === 'spec.md' ? 5 : 13}, исправлено: 0.` }], isError: false
        } },
        { jsonrpc: '2.0', id: 4, result: { content: [{ type: 'text', text: 'Ссылок проставлено: 0, исправлено: 0.' }], isError: false } }
      ]);
      assertLinkFiles(cwd, linkFiles); // итог совпадает с успешным link, включая CRLF
    } finally {
      chmodSync(path, 0o644);
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}
