'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { calculateOrderMetrics, createOrderKey, postInfo } = require('../src/hyperliquid');

test('calculateOrderMetrics uses the order limit and remaining size', () => {
  assert.deepEqual(calculateOrderMetrics({ coin: 'BTC', limitPx: '60000', sz: '2' }), {
    notional: 120000,
    price: 60000,
    size: 2,
  });
});

test('calculateOrderMetrics uses live mids without inventing coin mappings', () => {
  assert.deepEqual(calculateOrderMetrics({ coin: '@1', limitPx: '0', sz: '10' }, { '@1': '15.5' }), {
    notional: 155,
    price: 15.5,
    size: 10,
  });
  assert.equal(calculateOrderMetrics({ coin: 'UNKNOWN', limitPx: '0', sz: '10' }, {}), null);
});

test('createOrderKey is stable across address casing', () => {
  assert.equal(
    createOrderKey('0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD', 42),
    '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd:42',
  );
});

test('postInfo retries retryable server failures', async () => {
  let calls = 0;
  const response = await postInfo(
    'https://example.test/info',
    { type: 'allMids' },
    {
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return { ok: false, status: 503 };
        return { json: async () => ({ BTC: '60000' }), ok: true, status: 200 };
      },
      logger: { warn() {} },
      sleepImpl: async () => {},
    },
  );
  assert.equal(calls, 2);
  assert.equal(response.BTC, '60000');
});
