// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * ShiftFuel Playwright smoke-test config.
 * Run against a local dev server or set BASE_URL to the Vercel preview URL.
 *
 * Quick start:
 *   npx playwright install
 *   BASE_URL=https://your-preview.vercel.app npx playwright test
 *
 * Or against a local static server:
 *   npx serve . -l 3000   (in another terminal)
 *   BASE_URL=http://localhost:3000 npx playwright test
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
});
