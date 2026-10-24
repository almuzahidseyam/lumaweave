const { test, expect } = require('@playwright/test');
const base = 'http://127.0.0.1:4173';

test('preview needs no camera, works at phone width, and responds to controls', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.cameraRequests = 0;
    navigator.mediaDevices.getUserMedia = () => { window.cameraRequests++; throw new Error('Camera must not be requested'); };
  });
  await page.goto(`${base}/demo/index.html`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Extraordinary hands.');
  await expect(page.locator('#tracking')).toHaveText('No camera or microphone is being used.');
  await expect.poll(() => page.evaluate(() => window.cameraRequests)).toBe(0);
  await page.getByRole('button', { name: 'Ice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ice', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Gentler motion').check();
  expect(await page.evaluate(() => __lumaweaveFx.settings.reducedMotion)).toBe(true);
  await page.getByRole('button', { name: 'Pause the light' }).click();
  await expect(page.getByRole('button', { name: 'Turn on the light' })).toBeVisible();
  await page.keyboard.press('Alt+Shift+P');
  await expect(page.getByRole('button', { name: 'Pause the light' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('camera permission denial keeps the simulation usable', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Declined', 'NotAllowedError'));
  });
  await page.goto(`${base}/demo/index.html`);
  await page.getByRole('button', { name: 'Try with my camera' }).click();
  await expect(page.locator('#tracking')).toContainText('permission was declined');
  await expect(page.locator('#previewCanvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try with my camera' })).toBeEnabled();
});

test('real bundled models process a fake camera, segment and release all resources', async ({ page }) => {
  await page.goto(`${base}/demo/index.html`);
  await page.evaluate(() => {
    window.maskCount = 0;
    const create = __lumaweaveFx.createLighting;
    __lumaweaveFx.createLighting = () => {
      const lighting = create();
      const set = lighting.setMask;
      lighting.setMask = (mask, now) => { window.maskCount++; set(mask, now); };
      return lighting;
    };
  });
  await page.getByRole('button', { name: 'Try with my camera' }).click();
  await expect(page.locator('#cameraVideo')).toBeVisible();
  await expect.poll(() => page.evaluate(() => __lumaweaveFx.engine?.stats().tracking), { timeout: 45000 }).toBe('ready');
  await page.getByLabel('Person lighting').check();
  await expect.poll(() => page.evaluate(() => window.maskCount), { timeout: 45000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.querySelector('#cameraVideo').getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(3);
  await page.evaluate(() => { window.outputTrack = document.querySelector('#cameraVideo').srcObject.getVideoTracks()[0]; });
  await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
  await expect.poll(() => page.evaluate(() => __lumaweaveFx.engine)).toBeNull();
  expect(await page.evaluate(() => window.outputTrack.readyState)).toBe('ended');
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('stopping one output clone keeps the other camera consumer alive', async ({ page }) => {
  await page.goto(`${base}/demo/index.html`);
  await page.getByRole('button', { name: 'Try with my camera' }).click();
  await expect(page.locator('#cameraVideo')).toBeVisible();
  const result = await page.evaluate(async () => {
    const original = document.querySelector('#cameraVideo').srcObject.getVideoTracks()[0];
    const clone = original.clone();
    const processor = new MediaStreamTrackProcessor({ track: clone });
    const reader = processor.readable.getReader();
    original.stop();
    let frames = 0;
    try {
      for (let i = 0; i < 3; i++) {
        const next = await Promise.race([reader.read(), new Promise((_, reject) => setTimeout(() => reject(new Error('Clone stopped receiving frames')), 5000))]);
        if (next.done) break;
        frames++; next.value.close();
      }
      return { frames, engineAlive: !!__lumaweaveFx.engine };
    } finally { clone.stop(); reader.cancel().catch(() => {}); }
  });
  expect(result).toEqual({ frames: 3, engineAlive: true });
  await expect.poll(() => page.evaluate(() => __lumaweaveFx.engine)).toBeNull();
});

test('development server never exposes repository internals', async ({ request }) => {
  for (const path of ['/.git/config', '/package.json', '/src/%2e%2e/.git/config']) {
    expect((await request.get(base + path)).status()).toBe(404);
  }
});
