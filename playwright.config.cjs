const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './test/browser', timeout: 60000, workers: 1, fullyParallel: false,
  reporter: [['list']],
  use: { headless: true, viewport: { width: 1440, height: 1100 },
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader'] } },
  webServer: { command: 'node scripts/serve.mjs', url: 'http://127.0.0.1:4173/demo/index.html', reuseExistingServer: !process.env.CI },
});
