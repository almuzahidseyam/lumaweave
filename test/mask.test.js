const test = require('node:test');
const assert = require('node:assert/strict');
test('segmentation samples the actual output-mask dimensions, not the camera size', async () => {
  const { downsampleMask } = await import('../detector/mask.mjs');
  const result = downsampleMask(new Float32Array([0, 1, .5, .25]), 2, 2);
  assert.equal(result.width, 2);
  assert.deepEqual([...new Uint8ClampedArray(result.data)].filter((_, i) => i % 4 === 3), [0,255,128,64]);
  assert.equal(downsampleMask(new Float32Array(4), 640, 360), null);
});
test('mask downsampling keeps aspect ratio and clamps invalid confidence', async () => {
  const { downsampleMask } = await import('../detector/mask.mjs');
  const result = downsampleMask(new Float32Array([NaN, 5, -5, 1, 0, 1, 0, 1]), 4, 2, 2);
  assert.equal(result.height, 1);
  assert.equal(result.data.byteLength, 8);
});
