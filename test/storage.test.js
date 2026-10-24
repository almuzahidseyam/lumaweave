const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/settings.js');
const { createStore } = require('../src/storage.js');
test('local settings win over legacy synced settings', async () => {
  const store = createStore({ local: { get: async () => ({ settings: { darken: 12 } }) }, sync: { get: () => { throw new Error('Must not read cloud preferences'); } } });
  assert.equal((await store.load()).darken, 12);
});
test('legacy preferences migrate once and subsequent saves start immediately', async () => {
  const writes = [];
  const store = createStore({ local: { get: async () => ({}), set: value => { writes.push(value); return Promise.resolve(); } },
    sync: { get: async () => ({ settings: { darken: 42 } }) } });
  assert.equal((await store.load()).darken, 42);
  const saving = store.save({ darken: 20 });
  assert.equal(writes.length, 2, 'No delayed timer may lose a closing popup\'s final change');
  await saving;
  assert.equal(writes[1].settings.darken, 20);
});
test('storage failures propagate to the interface', async () => {
  const store = createStore({ local: { set: () => Promise.reject(new Error('Disk full')) } });
  await assert.rejects(store.save({}), /Disk full/);
});
