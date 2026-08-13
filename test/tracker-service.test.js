'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { TrackerService } = require('../src/tracker-service');

class MemoryStateStore {
  constructor() {
    this.orders = {};
    this.saves = 0;
  }

  get(key) {
    return this.orders[key];
  }

  has(key, status) {
    return Boolean(this.orders[key]?.statuses?.[status]);
  }

  record(key, status, metadata) {
    this.orders[key] ||= { statuses: {} };
    this.orders[key].statuses[status] = Date.now();
    this.orders[key].metadata = metadata;
  }

  async save() {
    this.saves += 1;
  }
}

function createService({ alertExistingOnStartup = true, sendImpl } = {}) {
  const messages = [];
  const stateStore = new MemoryStateStore();
  const notifier = {
    enabled: true,
    async send(message) {
      if (sendImpl) await sendImpl(message);
      messages.push(message);
    },
  };
  const service = new TrackerService({
    WebSocket: class {},
    config: {
      alertExistingOnStartup,
      alertOrderClosures: false,
      largeOrderThreshold: 50_000,
      targetAddress: '0x1111111111111111111111111111111111111111',
    },
    logger: { debug() {}, info() {}, warn() {} },
    notifier,
    stateStore,
  });
  return { messages, service, stateStore };
}

const largeOrder = { coin: 'BTC', limitPx: '60000', oid: 42, side: 'B', sz: '1' };

test('TrackerService delivers a large order once and persists after delivery', async () => {
  const { messages, service, stateStore } = createService();
  await service.handleOpenOrder(largeOrder);
  await service.handleOpenOrder(largeOrder);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /LARGE OPEN ORDER/);
  assert.equal(stateStore.has(`${service.config.targetAddress}:42`, 'open'), true);
  assert.equal(stateStore.saves, 1);
});

test('TrackerService ignores orders below the threshold', async () => {
  const { messages, service } = createService();
  await service.handleOpenOrder({ ...largeOrder, sz: '0.1' });
  assert.equal(messages.length, 0);
});

test('TrackerService can seed existing orders without alerting', async () => {
  const { messages, service, stateStore } = createService({ alertExistingOnStartup: false });
  await service.handleOpenOrder(largeOrder, { initial: true });
  assert.equal(messages.length, 0);
  assert.equal(stateStore.has(`${service.config.targetAddress}:42`, 'open'), true);
});

test('TrackerService does not persist a failed delivery so reconciliation can retry', async () => {
  let shouldFail = true;
  const { messages, service, stateStore } = createService({
    sendImpl: async () => {
      if (shouldFail) throw new Error('temporary failure');
    },
  });
  await assert.rejects(service.handleOpenOrder(largeOrder), /temporary failure/);
  assert.equal(stateStore.has(`${service.config.targetAddress}:42`, 'open'), false);
  shouldFail = false;
  await service.handleOpenOrder(largeOrder);
  assert.equal(messages.length, 1);
  assert.equal(stateStore.has(`${service.config.targetAddress}:42`, 'open'), true);
});
