'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { StateStore } = require('../src/state-store');

test('StateStore persists events and reloads them', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hl-tracker-state-'));
  t.after(() => fs.rm(directory, { force: true, recursive: true }));
  const file = path.join(directory, 'state.json');
  const store = new StateStore(file, { now: () => 1000 });
  await store.load();
  store.record('wallet:1', 'open', { notional: 100_000 });
  await store.save();

  const reloaded = new StateStore(file);
  await reloaded.load();
  assert.equal(reloaded.has('wallet:1', 'open'), true);
  assert.equal(reloaded.get('wallet:1').metadata.notional, 100_000);
});

test('StateStore backs up corrupt input', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hl-tracker-corrupt-'));
  t.after(() => fs.rm(directory, { force: true, recursive: true }));
  const file = path.join(directory, 'state.json');
  await fs.writeFile(file, '{broken');
  const warnings = [];
  const store = new StateStore(file, {
    logger: { warn: (message) => warnings.push(message) },
    now: () => 1234,
  });
  await store.load();
  assert.equal(store.has('missing', 'open'), false);
  assert.equal(warnings.length, 1);
  assert.equal(await fs.readFile(`${file}.corrupt-1234`, 'utf8'), '{broken');
});

test('StateStore prunes expired entries', () => {
  let now = 1000;
  const store = new StateStore('unused.json', { now: () => now });
  store.record('old', 'open');
  store.record('old', 'filled');
  now = 5000;
  store.record('new', 'open');
  assert.equal(store.prune(2000), 1);
  assert.equal(store.get('old'), undefined);
  assert.ok(store.get('new'));
});

test('StateStore retains a long-lived order that is still open', () => {
  let now = 1000;
  const store = new StateStore('unused.json', { now: () => now });
  store.record('open-order', 'open');
  now = 100_000;
  assert.equal(store.prune(2000), 0);
  assert.ok(store.get('open-order'));
});
