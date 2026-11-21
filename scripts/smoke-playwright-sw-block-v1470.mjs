// WAWIS 14.70 — stabilność testów: service worker domyślnie zablokowany w głównej konfiguracji Playwright
// (awaria Chromium headless shell przy zamykaniu kontekstu z instalującym się SW; diag 21.11.2026: 13/320 vs 0/320).
// Testy sprawdzające service worker muszą go włączać jawnie — inaczej przestałyby sprawdzać to, co mają.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const config = fs.readFileSync('playwright.config.js', 'utf8');
assert.match(config, /serviceWorkers:\s*'block'/, 'playwright.config.js: serviceWorkers: block');
for (const spec of ['mobile-precache-offline-v1376', 'mobile-nameplate-offline-readers-v1370', 'qr-service-request-v1420']) {
  assert.match(fs.readFileSync(`tests/e2e/${spec}.spec.js`, 'utf8'), /serviceWorkers:\s*'allow'/, `${spec}: service worker włączony jawnie`);
}
// Każdy test, który rejestruje lub odczytuje prawdziwy service worker, musi mieć jawne serviceWorkers: 'allow'.
for (const file of fs.readdirSync('tests/e2e').filter((f) => f.endsWith('.spec.js'))) {
  const src = fs.readFileSync(`tests/e2e/${file}`, 'utf8');
  const usesReal = /navigator\.serviceWorker\??\.(getRegistrations|ready|controller|register)/.test(src)
    && !/Object\.defineProperty\(navigator,\s*'serviceWorker'/.test(src);
  if (usesReal) assert.match(src, /serviceWorkers:\s*'allow'/, `${file}: używa service workera — wymaga serviceWorkers: 'allow'`);
}
console.log('PASS WAWIS 14.70 — service worker zablokowany domyślnie w testach; testy SW włączają go jawnie.');
