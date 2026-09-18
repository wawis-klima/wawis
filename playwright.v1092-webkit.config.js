import { defineConfig, devices } from '@playwright/test';

const PORT = 4182;
const baseURL = `http://127.0.0.1:${PORT}`;
const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [['line']],
  projects: [{
    name: 'webkit-iphone',
    use: {
      ...iphone14,
      browserName: 'webkit',
      baseURL,
      screenshot: 'only-on-failure',
      trace: 'retain-on-failure',
    },
  }],
  webServer: {
    command: `node scripts/playwright-vite-server.cjs ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
