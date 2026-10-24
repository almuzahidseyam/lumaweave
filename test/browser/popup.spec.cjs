const { test, expect } = require('@playwright/test');
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.saved = [];
    window.chrome = {
      storage: { local: { get: async () => ({}), set: async value => { window.saved.push(value); } }, sync: { get: async () => ({}) } },
      tabs: { query: async () => [{ id: 1 }], sendMessage: async () => ({ engine: true, active: false, tracking: 'ready', hands: 2 }), create: async () => {} },
      runtime: { getURL: path => path },
    };
  });
});
test('popup saves immediate changes, exports settings and rejects unrelated JSON', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/popup/popup.html');
  await expect(page.locator('#controls')).toBeEnabled();
  await expect(page.locator('#clapSound')).not.toBeChecked();
  await page.getByRole('button', { name: 'Ice', exact: true }).click();
  expect(await page.evaluate(() => window.saved.at(-1).settings.elements.glow.color)).toBe('#3cc8ff');
  await page.getByLabel('Tracking quality').selectOption('battery');
  expect(await page.evaluate(() => window.saved.at(-1).settings.performance)).toBe('battery');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('lumaweave-settings.json');
  await page.locator('#importFile').setInputFiles({ name: 'bad.json', mimeType:'application/json', buffer:Buffer.from('{"hello":true}') });
  await expect(page.locator('#saveStatus')).toContainText('Choose a LumaWeave settings export');
  await page.locator('#importFile').setInputFiles({ name: 'good.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify({application:'lumaweave',version:1,settings:{performance:'quality',darken:14}})) });
  await expect(page.locator('#performance')).toHaveValue('quality');
});
test('save failures are visible and camera-off toggle stays disabled', async ({ page }) => {
  await page.addInitScript(() => {
    chrome.tabs.sendMessage = async () => ({ engine: false, active: false, tracking: 'camera off' });
  });
  await page.goto('http://127.0.0.1:4173/popup/popup.html');
  await expect(page.locator('#controls')).toBeEnabled();
  await expect(page.locator('#toggle')).toBeDisabled();
  await page.evaluate(() => { chrome.storage.local.set = () => Promise.reject(new Error('Disk full')); });
  await page.getByRole('button', { name: 'Ember', exact: true }).click();
  await expect(page.locator('#saveStatus')).toContainText('Could not save');
});
