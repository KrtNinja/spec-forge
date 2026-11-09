// @ts-check
// Обмен с MCP-сервером для тестов: запуск, сообщения JSON-RPC, разбор вывода.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const root = resolve(import.meta.dirname, '..');
const server = resolve(root, 'server/mcp.mjs');
const exitTimeout = 2000;

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

/** @param {string} stdout */
function parse(stdout) {
  const lines = stdout.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.map(parseLine);
}

/**
 * Запускает сервер в папке cwd, передаёт строки и закрывает ввод.
 * Сервер должен ответить, сам завершиться с кодом 0 не дольше чем за 2 секунды
 * и выводить только сообщения JSON-RPC 2.0, по одному на строку.
 * @param {string} cwd
 * @param {string[]} lines
 * @returns {Promise<any[]>} разобранные сообщения сервера
 */
export function exchange(cwd, lines) {
  if (!existsSync(server)) throw new Error('Нет server/mcp.mjs: сервер ещё не реализован.');
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [server], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      child.kill();
      fail(new Error(`Сервер не завершился за 2 секунды после закрытия ввода.\n${stderr}`));
    }, exitTimeout);
    child.on('error', fail);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return fail(new Error(`Сервер завершился с кодом ${code}.\n${stderr}`));
      try {
        done(parse(stdout));
      } catch (error) {
        fail(error);
      }
    });
    child.stdin.end(lines.map((line) => `${line}\n`).join(''));
  });
}
