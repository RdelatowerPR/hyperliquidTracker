'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { loadConfig } = require('../src/config');

const address = '0x1111111111111111111111111111111111111111';

test('loadConfig parses a valid minimal environment', () => {
  const config = loadConfig({ TARGET_ADDRESS: address }, { cwd: 'C:\\tracker' });
  assert.equal(config.targetAddress, address);
  assert.equal(config.largeOrderThreshold, 50_000);
  assert.equal(config.telegramBotToken, '');
  assert.equal(config.alertExistingOnStartup, true);
  assert.match(config.stateFile, /seenOrders\.json$/);
});

test('loadConfig validates address and numeric settings', () => {
  assert.throws(() => loadConfig({ TARGET_ADDRESS: '' }), /TARGET_ADDRESS/);
  assert.throws(
    () => loadConfig({ TARGET_ADDRESS: '0x0000000000000000000000000000000000000000' }),
    /non-zero/,
  );
  assert.throws(
    () => loadConfig({ LARGE_ORDER_THRESHOLD: 'not-a-number', TARGET_ADDRESS: address }),
    /LARGE_ORDER_THRESHOLD/,
  );
});

test('loadConfig requires complete Telegram credentials', () => {
  assert.throws(
    () => loadConfig({ TARGET_ADDRESS: address, TELEGRAM_BOT_TOKEN: 'token-only' }),
    /must either both be set/,
  );
  const config = loadConfig({
    TARGET_ADDRESS: address,
    TELEGRAM_BOT_TOKEN: 'token',
    TELEGRAM_CHAT_ID: '1234',
  });
  assert.equal(config.telegramChatId, '1234');
});

test('loadConfig parses explicit booleans', () => {
  const config = loadConfig({
    ALERT_EXISTING_ON_STARTUP: 'false',
    ALERT_ORDER_CLOSURES: 'yes',
    TARGET_ADDRESS: address,
  });
  assert.equal(config.alertExistingOnStartup, false);
  assert.equal(config.alertOrderClosures, true);
});
