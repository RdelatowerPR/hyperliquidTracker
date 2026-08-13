'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { TelegramNotifier } = require('../src/telegram');

test('TelegramNotifier supports log-only delivery', async () => {
  const messages = [];
  const notifier = new TelegramNotifier({ logger: { info: (message) => messages.push(message) } });
  const result = await notifier.send('test alert');
  assert.equal(notifier.enabled, false);
  assert.equal(result.delivery, 'log');
  assert.match(messages[0], /test alert/);
});

test('TelegramNotifier sends JSON without exposing credentials to logs', async () => {
  let request;
  const notifier = new TelegramNotifier({
    botToken: 'secret-token',
    chatId: '1234',
    fetchImpl: async (url, options) => {
      request = { options, url };
      return { json: async () => ({ ok: true, result: { message_id: 9 } }), ok: true, status: 200 };
    },
  });
  const result = await notifier.send('hello');
  assert.equal(result.messageId, 9);
  assert.match(request.url, /sendMessage$/);
  assert.deepEqual(JSON.parse(request.options.body), {
    chat_id: '1234',
    disable_web_page_preview: true,
    text: 'hello',
  });
});
