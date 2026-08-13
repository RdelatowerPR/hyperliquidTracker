'use strict';

const path = require('node:path');

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS = /^0x0{40}$/i;

function parseBoolean(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (/^(1|true|yes|on)$/i.test(raw)) return true;
  if (/^(0|false|no|off)$/i.test(raw)) return false;
  throw new Error(`${name} must be true or false.`);
}

function parseNumber(env, name, fallback, { integer = false, min = 0 } = {}) {
  const raw = env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) {
    throw new Error(`${name} must be ${integer ? 'an integer' : 'a number'} greater than or equal to ${min}.`);
  }
  return value;
}

function parseUrl(env, name, fallback, allowedProtocols) {
  const value = env[name] || fallback;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`${name} must use ${allowedProtocols.join(' or ')}.`);
  }
  return parsed.toString();
}

function loadConfig(env = process.env, { cwd = process.cwd() } = {}) {
  const targetAddress = (env.TARGET_ADDRESS || '').trim();
  if (!ADDRESS_PATTERN.test(targetAddress) || ZERO_ADDRESS.test(targetAddress)) {
    throw new Error('TARGET_ADDRESS must be a non-zero, 42-character Ethereum address.');
  }

  const telegramBotToken = (env.TELEGRAM_BOT_TOKEN || '').trim();
  const telegramChatId = (env.TELEGRAM_CHAT_ID || '').trim();
  if (Boolean(telegramBotToken) !== Boolean(telegramChatId)) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must either both be set or both be blank.');
  }

  return Object.freeze({
    alertExistingOnStartup: parseBoolean(env, 'ALERT_EXISTING_ON_STARTUP', true),
    alertOrderClosures: parseBoolean(env, 'ALERT_ORDER_CLOSURES', false),
    debugMode: parseBoolean(env, 'DEBUG_MODE', false),
    heartbeatIntervalMs: parseNumber(env, 'HEARTBEAT_INTERVAL_MS', 30_000, {
      integer: true,
      min: 10_000,
    }),
    infoEndpoint: parseUrl(
      env,
      'HYPERLIQUID_INFO_ENDPOINT',
      'https://api.hyperliquid.xyz/info',
      ['https:', 'http:'],
    ),
    largeOrderThreshold: parseNumber(env, 'LARGE_ORDER_THRESHOLD', 50_000, { min: 0.01 }),
    maxReconnectDelayMs: parseNumber(env, 'MAX_RECONNECT_DELAY_MS', 30_000, {
      integer: true,
      min: 1_000,
    }),
    reconcileIntervalMs: parseNumber(env, 'RECONCILE_INTERVAL_MS', 30_000, {
      integer: true,
      min: 5_000,
    }),
    requestTimeoutMs: parseNumber(env, 'REQUEST_TIMEOUT_MS', 10_000, {
      integer: true,
      min: 1_000,
    }),
    sendStartupMessage: parseBoolean(env, 'SEND_STARTUP_MESSAGE', false),
    stateFile: path.resolve(cwd, env.STATE_FILE || 'seenOrders.json'),
    stateRetentionMs: parseNumber(env, 'STATE_RETENTION_MS', 7 * 24 * 60 * 60 * 1_000, {
      integer: true,
      min: 60_000,
    }),
    targetAddress: targetAddress.toLowerCase(),
    telegramBotToken,
    telegramChatId,
    wsEndpoint: parseUrl(
      env,
      'HYPERLIQUID_WS_ENDPOINT',
      'wss://api.hyperliquid.xyz/ws',
      ['wss:', 'ws:'],
    ),
  });
}

module.exports = { ADDRESS_PATTERN, loadConfig, parseBoolean, parseNumber };
