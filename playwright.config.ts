import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.COIN_TEST_URL || 'http://127.0.0.1:8787',
    headless: true,
    channel: process.env.COIN_BROWSER_CHANNEL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.COIN_TEST_URL
    ? undefined
    : {
        command: 'npm start',
        url: 'http://127.0.0.1:8787/api/health',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
});
