const { test, expect, chromium } = require('@playwright/test');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');

test('installed MV3 extension hooks Meet, communicates with its real detector and updates preferences', async () => {
  test.setTimeout(90000);
  const profile = await mkdtemp(join(tmpdir(), 'lumaweave-browser-'));
  const root = resolve(__dirname, '../..');
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel:process.env.LUMAWEAVE_BROWSER_CHANNEL || 'chromium', headless:true,
      ignoreDefaultArgs:['--disable-extensions'],
      args:[`--disable-extensions-except=${root}`, `--load-extension=${root}`,
        '--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--enable-unsafe-swiftshader'],
    });
    await context.grantPermissions(['camera','microphone'], { origin:'https://meet.google.com' });
    // Use a local fixture at the matching origin. No real call/account is opened.
    await context.route('https://meet.google.com/**', route => route.fulfill({
      contentType:'text/html', headers:{'Content-Security-Policy':"require-trusted-types-for 'script'; trusted-types default;"},
      body:'<!doctype html><html><head><title>Meet fixture</title></head><body><video id="video" autoplay muted playsinline></video></body></html>',
    }));
    const meet = await context.newPage();
    await meet.goto('https://meet.google.com/lumaweave-test');
    await meet.waitForFunction(() => document.documentElement.dataset.lumaweaveBase);
    const base = await meet.evaluate(() => document.documentElement.dataset.lumaweaveBase);
    expect(base).toMatch(/^chrome-extension:\/\//);
    await meet.evaluate(async () => {
      window.meetStream = await navigator.mediaDevices.getUserMedia({video:{width:640,height:360},audio:true});
      document.querySelector('#video').srcObject = window.meetStream;
      await document.querySelector('#video').play();
    });
    const startup = await meet.evaluate(() => ({
      engine: !!__lumaweaveFx.engine, supported: __lumaweaveFx.isSupported(), hooked: __lumaweaveFx.hooked,
      status: [...document.querySelectorAll('[role=status]')].map(node => node.textContent),
    }));
    expect(startup.engine, JSON.stringify(startup)).toBe(true);
    await expect.poll(() => meet.evaluate(() => __lumaweaveFx.engine?.stats().tracking), {timeout:45000}).toBe('ready');
    const popup = await context.newPage();
    await popup.goto(new URL('popup/popup.html',base).href);
    await expect(popup.locator('#controls')).toBeEnabled();
    const previewOpened = context.waitForEvent('page');
    await popup.getByRole('button', {name:'Open camera-free preview'}).click();
    const preview = await previewOpened;
    await expect(preview.locator('#tracking')).toHaveText('No camera or microphone is being used.');
    await preview.close();
    await popup.evaluate(async () => {
      const settings = __lumaweaveSettings.sanitize({performance:'battery'});
      await chrome.storage.local.set({settings});
    });
    await expect.poll(() => meet.evaluate(() => __lumaweaveFx.settings.performance)).toBe('battery');
    await meet.bringToFront();
    await meet.keyboard.press('Alt+Shift+P');
    expect(await meet.evaluate(() => __lumaweaveFx.engine.stats().active)).toBe(true);
    await meet.evaluate(() => window.meetStream.getTracks().forEach(track=>track.stop()));
    await expect.poll(() => meet.evaluate(() => __lumaweaveFx.engine)).toBeNull();
    await expect(meet.locator('iframe')).toHaveCount(0);
  } finally {
    await context?.close();
    // This path is exclusively a just-created disposable browser profile.
    const parent = resolve(tmpdir());
    if (!resolve(profile).startsWith(parent + require('node:path').sep) || !profile.includes('lumaweave-browser-')) throw new Error('Unexpected profile path');
    await rm(profile, {recursive:true,force:true});
  }
});
