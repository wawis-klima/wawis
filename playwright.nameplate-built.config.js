import { defineConfig } from '@playwright/test';

// WAWIS 13.69 — E2E odczytu tabliczek (w tym bez internetu), ale na zbudowanej aplikacji (vite build + vite preview, mock Supabase).
const PORT = Number(process.env.PLAYWRIGHT_BUILT_PORT || 4175);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['mobile-nameplate-robustness-v1123.spec.js'],
  timeout: 200_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'playwright-report-nameplate/results.json' }], ['html', { open: 'never', outputFolder: 'playwright-report-nameplate/html' }]],
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node scripts/playwright-vite-built-server.cjs ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
