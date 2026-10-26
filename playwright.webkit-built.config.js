import { defineConfig } from '@playwright/test';

// WAWIS — E2E zbudowanej aplikacji w silniku WebKit (Safari) z profilem iPhone'a.
// Te same scenariusze co built-photo-queue-e2e i built-nameplate-e2e (Chromium): kolejka zdjęć,
// tabliczki bez internetu, czytniki offline. Uwaga: WebKit na Linuksie to silnik Safari, ale nie Safari na iOS —
// test na fizycznym iPhonie pozostaje obowiązkowy dla zmian zdjęć, offline i service workera.
//
// Świadomie poza WebKit (ograniczenia środowiska testowego, nie aplikacji — sprawdzone 26.10.2026):
// - mobile-nameplate-offline-readers-v1370: w WebKit emulacja offline Playwrighta (context.setOffline) omija
//   service worker — bez sieci nie ładuje się nawet ekran aplikacji, choć pliki są w cache (6/6).
//   Prawdziwy offline sprawdza Chromium (built-nameplate-e2e) i fizyczny iPhone.
// - mobile-nameplate-ai-saving-v1373: WebKit na Linuksie nie dekoduje syntetycznego kodu Code 128 z SVG
//   (EAN dekoduje), więc scenariusz „numer z kodu → bez AI” nie ma tu danych wejściowych.
//   Logikę sprawdza Chromium (built-nameplate-e2e) i smoke-nameplate-ai-saving-v1373; na iPhonie — test właściciela.
// - mobile-precache-offline-v1376: prawdziwy offline (context.setOffline) — jak wyżej, emulacja WebKit omija SW.
//   Pełne pobranie wersji sprawdza Chromium (built-photo-queue-e2e), smoke-sw-precache-v1376 i iPhone.
const PORT = Number(process.env.PLAYWRIGHT_BUILT_PORT || 4176);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: [
    'mobile-photo-queue-repair-v1362.spec.js',
    'mobile-photo-queue-legacy-hold-v1362.spec.js',
    'mobile-offline-nameplates-all-roles-v1363.spec.js',
    'mobile-nameplate-robustness-v1123.spec.js',
    'mobile-device-draft-persistence-v1371.spec.js',
    'mobile-device-draft-save-now-v1372.spec.js',
    'mobile-indexeddb-newer-version-v1376.spec.js',
    'mobile-lazy-screen-fallback-v1376.spec.js',
  ],
  timeout: 240_000,
  expect: { timeout: 15_000 },
  // Decyzja właściciela 26.10.2026: w CI jedno ponowienie testu, który nie przeszedł (niestabilność serwera testowego).
  // Test zaliczony dopiero za drugim razem jest oznaczany w adnotacjach jako niestabilny; dwa niepowodzenia = NO-GO.
  retries: process.env.CI ? 1 : 0,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'playwright-report-webkit/results.json' }], ['html', { open: 'never', outputFolder: 'playwright-report-webkit/html' }]],
  use: {
    baseURL,
    browserName: 'webkit',
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
