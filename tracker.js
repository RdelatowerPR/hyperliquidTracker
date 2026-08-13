'use strict';

require('dotenv').config({ quiet: true });

const WebSocket = require('ws');

const { loadConfig } = require('./src/config');
const { StateStore } = require('./src/state-store');
const { TelegramNotifier } = require('./src/telegram');
const { TrackerService } = require('./src/tracker-service');

function createLogger(debugEnabled) {
  return {
    debug: debugEnabled ? (...args) => console.debug('[debug]', ...args) : () => {},
    error: (...args) => console.error('[error]', ...args),
    info: (...args) => console.info('[info]', ...args),
    warn: (...args) => console.warn('[warn]', ...args),
  };
}

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.debugMode);
  const stateStore = new StateStore(config.stateFile, { logger });
  const notifier = new TelegramNotifier({
    botToken: config.telegramBotToken,
    chatId: config.telegramChatId,
    logger,
    timeoutMs: config.requestTimeoutMs,
  });
  const service = new TrackerService({
    config,
    logger,
    notifier,
    stateStore,
    WebSocket,
  });

  let stopping = false;
  const stop = async (signal) => {
    if (stopping) return;
    stopping = true;
    logger.info(`Received ${signal}; stopping.`);
    await service.stop();
  };

  process.once('SIGINT', () => void stop('SIGINT'));
  process.once('SIGTERM', () => void stop('SIGTERM'));

  await service.start();
  logger.info(
    `Tracking ${config.targetAddress} for open orders worth at least $${config.largeOrderThreshold.toLocaleString('en-US')}.`,
  );
  logger.info(notifier.enabled ? 'Telegram delivery enabled.' : 'Telegram credentials absent; using log-only mode.');

  return service;
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[fatal]', error.message);
    process.exitCode = 1;
  });
}

module.exports = { createLogger, main };
