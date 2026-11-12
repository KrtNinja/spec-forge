// @ts-check
// Обмен с MCP-сервером для тестов: запуск, сообщения JSON-RPC, разбор вывода.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Тесты запускаются из корня репозитория, и корень — текущая папка, а не место файла теста.
// В мутационном прогоне тесты — ссылки на исходное дерево, а сервер с мутацией — копия
// в рабочей папке: путь от файла теста привёл бы к неизменённому серверу.
export const root = process.cwd();
const server = resolve(root, 'server/mcp.mjs');
const timeout = 2000;

/**
 * Сообщение JSON-RPC 2.0 одной строкой. Без номера — уведомление.
 * @param {string} method
 * @param {unknown} [params]
 * @param {number} [id]
 */
export function message(method, params, id) {
  return JSON.stringify({
    jsonrpc: '2.0',
    ...(id === undefined ? {} : { id }),
    method,
    ...(params === undefined ? {} : { params })
  });
}

/**
 * Обычное начало обмена по MCP: initialize с номером 1 и уведомление initialized.
 * @param {string} [protocolVersion]
 */
export function handshake(protocolVersion = '2025-06-18') {
  return [
    message('initialize', {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: 'spec-forge-tests', version: '0' }
    }, 1),
    message('notifications/initialized')
  ];
}

/** @param {string} line */
function parseLine(line) {
  let reply;
  try {
    reply = JSON.parse(line);
  } catch {
    throw new Error(`В выводе сервера строка не JSON: ${line}`);
  }
  if (reply?.jsonrpc !== '2.0') throw new Error(`В выводе сервера не сообщение JSON-RPC 2.0: ${line}`);
  return reply;
}

/**
 * Сообщения из законченных строк вывода. Хвост без перевода строки ещё не сообщение.
 * @param {string} stdout
 */
function parse(stdout) {
  return stdout.split('\n').slice(0, -1).map(parseLine);
}

/**
 * Номер ответа, которого ждём на строку: номер запроса, null для строки не JSON,
 * undefined для уведомления — на него ответа нет.
 * @param {string} line
 * @returns {unknown}
 */
function expectedId(line) {
  try {
    return JSON.parse(line).id;
  } catch {
    return null;
  }
}

/**
 * Ждёт условия не дольше 2 секунд.
 * @param {() => boolean} ready
 * @param {() => string} problem
 */
async function until(ready, problem) {
  const deadline = Date.now() + timeout;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error(problem());
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Запускает сервер в папке cwd и передаёт строки по одной, как GigaCode:
 * ввод открыт, на каждый запрос ответ ждём до отправки следующей строки.
 * Затем закрывает ввод. Сервер должен выводить только сообщения JSON-RPC 2.0,
 * по одному на строку, отвечать не дольше 2 секунд и после закрытия ввода
 * сам завершаться с кодом 0 не дольше чем за 2 секунды.
 * @param {string} cwd
 * @param {string[]} lines
 * @param {(index: number) => void} [beforeSend] действия перед запросом, после ответа на предыдущий
 * @returns {Promise<any[]>} все сообщения сервера
 */
export async function exchange(cwd, lines, beforeSend = () => {}) {
  if (!existsSync(server)) throw new Error('Нет server/mcp.mjs: тесты запущены не из корня репозитория.');
  const child = spawn(process.execPath, [server], { cwd });
  let stdout = '';
  let stderr = '';
  /** @type {number | null | undefined} */
  let code;
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  child.stdin.on('error', () => {}); // сервер упал раньше времени — об этом скажет код завершения
  child.on('close', (status) => { code = status; });
  try {
    for (const [index, line] of lines.entries()) {
      beforeSend(index);
      child.stdin.write(`${line}\n`);
      const id = expectedId(line);
      if (id === undefined) continue;
      await until(() => parse(stdout).some((reply) => reply.id === id), () => `Нет ответа при открытом вводе на: ${line}\n${stderr}`);
    }
    child.stdin.end();
    await until(() => code !== undefined, () => `Сервер не завершился за 2 секунды после закрытия ввода.\n${stderr}`);
  } finally {
    child.kill();
  }
  if (code !== 0) throw new Error(`Сервер завершился с кодом ${code}.\n${stderr}`);
  if (stdout !== '' && !stdout.endsWith('\n')) throw new Error('Последнее сообщение сервера без перевода строки.');
  return parse(stdout);
}
