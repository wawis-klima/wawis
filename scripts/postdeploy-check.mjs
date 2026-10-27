#!/usr/bin/env node
// WAWIS 13.82 — kontrola produkcji po każdym wdrożeniu Vercel (tylko odczyt).
//
// Bez logowania, bez zapisu danych, bez sekretów. Sprawdza to, czego testy przed wydaniem nie widzą:
//   1. /app-version.json = wersja wdrożonego commitu (czeka na przełączenie domeny),
//   2. /precache-manifest.json tej wersji i KAŻDY wymieniony w nim plik: HTTP 200 i niepusty
//      (brak pliku = biały ekran bez internetu albo nieudana aktualizacja na iPhonie),
//   3. /push-sw.js z pamięcią podręczną tej wersji,
//   4. strona startowa w Chromium (komputer) i WebKit (profil iPhone'a): bez nieobsłużonych błędów,
//      bez nieudanych plików aplikacji, ekran nie jest pusty; w Chromium service worker zapisuje
//      wszystkie pliki krytyczne w pamięci przeglądarki.
//
// Użycie: node scripts/postdeploy-check.mjs --url https://wawis-klima.vercel.app --expect 13.82
import fs from 'node:fs';

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}

const BASE = arg('url', 'https://wawis-klima.vercel.app').replace(/\/$/, '');
const EXPECT = arg('expect') || JSON.parse(fs.readFileSync('app-version.json', 'utf8')).version;
const WAIT_MS = Number(arg('wait-ms', String(8 * 60 * 1000)));
const SKIP_BROWSERS = process.argv.includes('--skip-browsers');
const failures = [];
const warnings = [];
const summary = [];

const fail = (message) => { failures.push(message); console.log(`::error::${message}`); };
const warn = (message) => { warnings.push(message); console.log(`::warning::${message}`); };
const ok = (message) => { summary.push(`✓ ${message}`); console.log(`OK  ${message}`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, headers: { 'cache-control': 'no-cache', ...(options.headers || {}) } });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForVersion() {
  const deadline = Date.now() + WAIT_MS;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(`${BASE}/app-version.json?postdeploy=${Date.now()}`);
      last = response.ok ? String((await response.json())?.version || '') : `HTTP ${response.status}`;
      if (last === EXPECT) return true;
    } catch (error) {
      last = String(error?.message || error);
    }
    await sleep(15000);
  }
  fail(`/app-version.json nie pokazuje ${EXPECT} (ostatnio: ${last || 'brak odpowiedzi'})`);
  return false;
}

async function checkFiles() {
  const response = await fetchWithTimeout(`${BASE}/precache-manifest.json?postdeploy=${Date.now()}`);
  if (!response.ok) { fail(`/precache-manifest.json: HTTP ${response.status}`); return null; }
  const manifest = await response.json();
  if (manifest.version !== EXPECT) fail(`precache-manifest.json ma wersję ${manifest.version}, oczekiwano ${EXPECT}`);
  const critical = Array.isArray(manifest.critical) ? manifest.critical : [];
  const optional = Array.isArray(manifest.optional) ? manifest.optional : [];
  if (!critical.includes('/') || critical.length < 2) fail('precache-manifest.json: brak strony startowej lub skryptów na liście krytycznej');

  const problems = [];
  const queue = [...critical.map((url) => ({ url, critical: true })), ...optional.map((url) => ({ url, critical: false }))];
  let bytes = 0;
  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      try {
        const res = await fetchWithTimeout(`${BASE}${item.url}`);
        const body = Buffer.from(await res.arrayBuffer());
        bytes += body.length;
        if (!res.ok) problems.push({ ...item, reason: `HTTP ${res.status}` });
        else if (!body.length) problems.push({ ...item, reason: 'pusty plik' });
        else if (/\.(?:js|mjs)$/.test(item.url) && /^\s*<!doctype html/i.test(body.subarray(0, 64).toString())) {
          problems.push({ ...item, reason: 'zamiast skryptu zwrócono stronę HTML' });
        }
      } catch (error) {
        problems.push({ ...item, reason: String(error?.message || error) });
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  for (const problem of problems) {
    (problem.critical ? fail : warn)(`${problem.critical ? 'Plik krytyczny' : 'Plik dodatkowy'} ${problem.url}: ${problem.reason}`);
  }
  if (!problems.some((p) => p.critical)) ok(`${critical.length} plików krytycznych i ${optional.length} dodatkowych dostępnych (${(bytes / 1048576).toFixed(1)} MB)`);

  const sw = await fetchWithTimeout(`${BASE}/push-sw.js?postdeploy=${Date.now()}`);
  const swText = sw.ok ? await sw.text() : '';
  if (!swText.includes(`wawis-app-shell-v${EXPECT}`)) fail(`/push-sw.js nie zawiera pamięci podręcznej wawis-app-shell-v${EXPECT}`);
  else ok(`service worker wersji ${EXPECT}`);
  return { critical, optional };
}

async function checkBrowser(playwright, name, contextOptions, manifest, { requireServiceWorker }) {
  const browser = await playwright[name].launch();
  const label = name === 'webkit' ? 'WebKit (iPhone)' : 'Chromium (komputer)';
  try {
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    const pageErrors = [];
    const failedAssets = [];
    const origin = new URL(BASE).origin;
    page.on('pageerror', (error) => pageErrors.push(String(error?.message || error).slice(0, 200)));
    page.on('response', (response) => {
      const url = response.url();
      if (url.startsWith(origin) && response.status() >= 400) failedAssets.push(`${new URL(url).pathname} HTTP ${response.status()}`);
    });
    page.on('requestfailed', (request) => {
      const url = request.url();
      if (url.startsWith(origin)) failedAssets.push(`${new URL(url).pathname} ${request.failure()?.errorText || 'błąd'}`);
    });

    await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(4000);
    const visible = await page.evaluate(() => {
      const root = document.getElementById('root');
      return { children: root ? root.childElementCount : 0, text: (document.body?.innerText || '').trim().length };
    });
    if (!visible.children || visible.text < 10) fail(`${label}: pusty ekran po otwarciu strony`);
    else ok(`${label}: strona startowa wyświetla się`);
    if (pageErrors.length) fail(`${label}: nieobsłużone błędy JavaScript: ${pageErrors.slice(0, 3).join(' | ')}`);
    if (failedAssets.length) fail(`${label}: nieudane pliki aplikacji: ${failedAssets.slice(0, 5).join(' | ')}`);

    const sw = await page.evaluate(async ({ expect, critical }) => {
      if (!('serviceWorker' in navigator)) return { supported: false };
      const ready = await Promise.race([
        navigator.serviceWorker.ready.then((r) => r.active?.scriptURL || ''),
        new Promise((resolve) => setTimeout(() => resolve(''), 60000)),
      ]);
      if (!ready) return { supported: true, active: false };
      const deadline = Date.now() + 90000;
      let missing = critical;
      while (Date.now() < deadline) {
        const cache = await caches.open(`wawis-app-shell-v${expect}`);
        const keys = new Set((await cache.keys()).map((request) => new URL(request.url).pathname));
        missing = critical.filter((url) => !keys.has(url));
        if (!missing.length) break;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      return { supported: true, active: true, missing: missing.slice(0, 5), missingCount: missing.length };
    }, { expect: EXPECT, critical: manifest?.critical || [] });

    const report = requireServiceWorker ? fail : warn;
    if (!sw.supported) report(`${label}: brak obsługi service workera`);
    else if (!sw.active) report(`${label}: service worker nie uruchomił się w 60 s`);
    else if (sw.missingCount) report(`${label}: w pamięci przeglądarki brakuje ${sw.missingCount} plików krytycznych (np. ${sw.missing.join(', ')})`);
    else ok(`${label}: service worker zapisał wszystkie pliki krytyczne wersji ${EXPECT}`);
    await context.close();
  } finally {
    await browser.close();
  }
}

console.log(`WAWIS — kontrola produkcji po wdrożeniu: ${BASE}, oczekiwana wersja ${EXPECT}`);
if (await waitForVersion()) {
  ok(`/app-version.json = ${EXPECT}`);
  const manifest = await checkFiles();
  if (!SKIP_BROWSERS) {
    const playwright = await import('@playwright/test').catch(() => import('playwright'));
    await checkBrowser(playwright, 'chromium', { viewport: { width: 1366, height: 900 } }, manifest, { requireServiceWorker: true });
    // WebKit w Playwright (Linux) nie zawsze odzwierciedla service worker Safari — wynik SW tylko jako ostrzeżenie.
    await checkBrowser(playwright, 'webkit', { ...playwright.devices['iPhone 14'] }, manifest, { requireServiceWorker: false });
  }
}

const lines = [
  `## Kontrola produkcji po wdrożeniu — ${EXPECT}`,
  '',
  ...summary,
  ...warnings.map((w) => `⚠ ${w}`),
  ...failures.map((f) => `✗ ${f}`),
  '',
  failures.length ? `**WYNIK: BŁĄD (${failures.length})**` : '**WYNIK: OK**',
];
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
fs.writeFileSync(arg('report', 'postdeploy-report.md'), `${lines.join('\n')}\n`);
console.log(failures.length ? `WYNIK: BŁĄD (${failures.length})` : 'WYNIK: OK');
process.exit(failures.length ? 1 : 0);
