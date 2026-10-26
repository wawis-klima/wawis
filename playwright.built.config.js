import { defineConfig } from '@playwright/test';

// WAWIS 13.62 — te same E2E kolejki zdjęć, ale na zbudowanej aplikacji (vite build + vite preview, mock Supabase).
const PORT = Number(process.env.PLAYWRIGHT_BUILT_PORT || 4174);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: [
    'mobile-photo-queue-repair-v1362.spec.js',
    'mobile-photo-queue-legacy-hold-v1362.spec.js',
    'mobile-offline-nameplates-all-roles-v1363.spec.js',
    'mobile-device-draft-persistence-v1371.spec.js',
    'mobile-device-draft-save-now-v1372.spec.js',
    'mobile-precache-offline-v1376.spec.js',
    'mobile-indexeddb-newer-version-v1376.spec.js',
  ],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // Decyzja właściciela 26.10.2026: w CI jedno ponowienie testu, który nie przeszedł (niestabilność serwera testowego).
  // Test zaliczony dopiero za drugim razem jest oznaczany w adnotacjach jako niestabilny; dwa niepowodzenia = NO-GO.
  retries: process.env.CI ? 1 : 0,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'playwright-report-built/results.json' }], ['html', { open: 'never', outputFolder: 'playwright-report-built/html' }]],
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
