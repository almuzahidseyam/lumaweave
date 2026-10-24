// Run with: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/settings.js');

test('empty or garbage input falls back to defaults', () => {
  assert.deepStrictEqual(S.sanitize(undefined), S.sanitize({}));
  assert.deepStrictEqual(S.sanitize('nope').elements.lines, S.DEFAULTS.elements.lines);
  assert.strictEqual(S.sanitize({}).darken, 25);
});

test('invalid colors and out-of-range numbers are rejected or clamped', () => {
  const s = S.sanitize({
    elements: { lines: { on: 'yes', color: 'red' }, dust: { on: false, color: '#ABCDEF' } },
    darken: 500,
    lightSpill: { on: true, strength: -20 },
    personLight: { on: true, strength: 'x' },
  });
  assert.deepStrictEqual(s.elements.lines, S.DEFAULTS.elements.lines);
  assert.deepStrictEqual(s.elements.dust, { on: false, color: '#abcdef' });
  assert.strictEqual(s.darken, 60);
  assert.strictEqual(s.lightSpill.strength, 0);
  assert.strictEqual(s.personLight.strength, S.DEFAULTS.personLight.strength);
});

test('presets change colors but keep on/off choices', () => {
  const base = S.sanitize({ elements: { shards: { on: false } } });
  const ice = S.applyPreset(base, 'Ice');
  assert.strictEqual(ice.elements.glow.color, S.PRESETS.Ice.glow);
  assert.strictEqual(ice.elements.shards.on, false);
  assert.strictEqual(base.elements.glow.color, S.DEFAULTS.elements.glow.color); // not mutated
});

test('rgb converts hex to an rgba() component list', () => {
  assert.strictEqual(S.rgb('#a878ff'), '168, 120, 255');
});
