// Run with: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const { createClapDetector, createDoubleClap } = require('../src/clap.js');

// A flat fake hand: wrist below the knuckles by `size`. Its palm center is the
// same height for every hand, so the palm gap equals the horizontal offset.
function hand(cx, cy, size = 0.1, handedness = 'Left') {
  const landmarks = Array.from({ length: 21 }, () => [cx, cy, 0]);
  landmarks[0] = [cx, cy + size, 0];
  return { handedness, landmarks };
}

const ASPECT = 1; // keep the math simple

// Left hand on the left of the image, `gap` hand-sizes apart. A negative gap
// puts the hands on swapped sides (arms crossed).
function pair(gap, size = 0.1) {
  const half = (gap * size) / 2;
  return [hand(0.5 - half, 0.5, size, 'Left'), hand(0.5 + half, 0.5, size, 'Right')];
}

// Feeds a list of [gap or null, time] samples; returns the times a clap fired.
function run(d, steps) {
  return steps
    .filter(([gap, t]) => d.update(gap === null ? [] : pair(gap), t, ASPECT))
    .map(([, t]) => t);
}

test('apart then together quickly is a clap (after the confirm delay)', () => {
  const d = createClapDetector();
  assert.deepStrictEqual(run(d, [[3, 0], [1.5, 120], [0.4, 240], [0.4, 330], [0.5, 440]]), [440]);
});

test('slowly bringing hands together is not a clap', () => {
  const d = createClapDetector();
  assert.deepStrictEqual(run(d, [[3, 0], [1.4, 800], [0.4, 1600], [0.4, 1900]]), []);
});

test('hands held together fire once only', () => {
  const d = createClapDetector();
  const steps = [[3, 0], [0.4, 200], [0.4, 400], [0.4, 600], [0.4, 2000], [0.4, 2300]];
  assert.deepStrictEqual(run(d, steps), [400]);
});

test('second clap after cooldown toggles again', () => {
  const d = createClapDetector();
  const steps = [[3, 0], [0.4, 200], [0.4, 400], [3, 1500], [0.5, 1700], [0.5, 1900]];
  assert.deepStrictEqual(run(d, steps), [400, 1900]);
});

test('arms crossing past each other is not a clap', () => {
  const d = createClapDetector();
  assert.deepStrictEqual(run(d, [[3, 0], [0.5, 150], [-1, 250], [-3, 400], [-3, 600]]), []);
});

test('flat hands slapping together (fingers sideways) is not a clap', () => {
  const d = createClapDetector();
  // Wrist beside the knuckles instead of below them.
  const flat = (cx, handedness) => {
    const h = hand(cx, 0.5, 0.1, handedness);
    return { ...h, landmarks: h.landmarks.map((p, i) => (i === 0 ? [cx - 0.1, 0.5, 0] : p)) };
  };
  assert.strictEqual(d.update([flat(0.35, 'Left'), flat(0.65, 'Right')], 0, ASPECT), false);
  assert.strictEqual(d.update([flat(0.48, 'Left'), flat(0.52, 'Right')], 150, ASPECT), false);
  assert.strictEqual(d.update([flat(0.48, 'Left'), flat(0.52, 'Right')], 400, ASPECT), false);
});

test('tracking lost right as palms meet counts as a clap', () => {
  const d = createClapDetector();
  assert.deepStrictEqual(run(d, [[3, 0], [0.9, 150], [null, 220]]), [220]);
});

test('tracking lost after a touch still confirms the clap', () => {
  const d = createClapDetector();
  assert.deepStrictEqual(run(d, [[3, 0], [0.5, 150], [null, 220], [null, 260]]), [260]);
});

test('a hand leaving the frame while far apart is not a clap', () => {
  const d = createClapDetector();
  d.update(pair(3), 0, ASPECT);
  assert.strictEqual(d.update([pair(3)[0]], 100, ASPECT), false);
});

test('a clap sound counts when a hand was in view recently', () => {
  const d = createClapDetector();
  d.update([pair(3)[0]], 0, ASPECT);
  assert.strictEqual(d.confirmAudio(300), true);
});

test('a clap sound with no hands in view is ignored', () => {
  const d = createClapDetector();
  assert.strictEqual(d.confirmAudio(100), false);
  d.update([pair(3)[0]], 200, ASPECT);
  assert.strictEqual(d.confirmAudio(2000), false);
});

test('camera and sound seeing the same clap count once', () => {
  const d = createClapDetector();
  assert.deepStrictEqual(run(d, [[3, 0], [0.4, 150], [0.4, 260]]), [260]);
  assert.strictEqual(d.confirmAudio(300), false);
});

test('two claps in quick succession toggle; one clap waits', () => {
  const dc = createDoubleClap();
  assert.strictEqual(dc.register(1000), 'first');
  assert.strictEqual(dc.register(1450), 'double');
});

test('claps too far apart start a new pair instead of toggling', () => {
  const dc = createDoubleClap();
  assert.strictEqual(dc.register(0), 'first');
  assert.strictEqual(dc.register(2000), 'first');
  assert.strictEqual(dc.register(2400), 'double');
});

test('a third clap right after a double clap does not toggle back', () => {
  const dc = createDoubleClap();
  dc.register(0);
  assert.strictEqual(dc.register(400), 'double');
  assert.strictEqual(dc.register(800), 'ignored');
  assert.strictEqual(dc.register(2000), 'first');
  assert.strictEqual(dc.register(2350), 'double');
});

test('one clap detected twice within a blink is not a double clap', () => {
  const dc = createDoubleClap();
  dc.register(0);
  assert.strictEqual(dc.register(60), 'ignored');
  assert.strictEqual(dc.register(500), 'double');
});
