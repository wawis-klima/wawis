// WAWIS 14.50 — atrapa bazy (mockSupabaseClient.js) poza paczką produkcyjną (audyt 20.11.2026, decyzja właściciela).
// RED na 14.49: src/lib/supabase.js i src/mobile791/lib/supabase.js wybierały atrapę warunkiem liczonym w czasie
// działania (`import.meta.env` → obiekt), więc bundler nie mógł jej usunąć — ok. 2 × 1100 linii atrapy z danymi
// testowymi (admin@wawis.test / test1234) trafiało do kodu pobieranego przez telefony i komputery.
// GREEN: o atrapie decyduje stała z vite.config.js (__WAWIS_SUPABASE_MOCK__); w produkcji `false` i gałąź atrapy
// znika z paczki. Testy E2E (VITE_SUPABASE_MODE=mock) nadal dostają atrapę — sprawdzane drugim buildem.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite';

// Uwaga: 'klima-mock-supabase-session' występuje też w public-qr-api.js (rozpoznanie sesji testowej), więc nie jest znacznikiem.
const MARKERS = ['admin@wawis.test', 'pracownik@wawis.test', 'mock://supabase'];

for (const file of ['src/lib/supabase.js', 'src/mobile791/lib/supabase.js']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /isSupabaseMockEnabled = typeof __WAWIS_SUPABASE_MOCK__ === 'boolean' \? __WAWIS_SUPABASE_MOCK__ : false;/,
    `${file}: atrapa wybierana stałą z czasu budowania`);
  assert.doesNotMatch(source, /isSupabaseMockEnabled = supabaseMode ===/, `${file}: bez warunku liczonego w czasie działania`);
}
const viteConfig = fs.readFileSync('vite.config.js', 'utf8');
assert.match(viteConfig, /__WAWIS_SUPABASE_MOCK__: JSON\.stringify\(isSupabaseMockBuild\(mode\)\)/);

function readBundle(outDir) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs|html)$/.test(entry.name)) files.push(full);
    }
  };
  walk(outDir);
  return files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
}

async function buildWith(env) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wawis-build-'));
  const saved = {};
  for (const key of ['VITE_SUPABASE_MODE', 'VITE_SUPABASE_MOCK', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
    saved[key] = process.env[key];
    if (key in env) process.env[key] = env[key]; else delete process.env[key];
  }
  try {
    await build({ logLevel: 'error', build: { outDir, emptyOutDir: true } });
    return readBundle(outDir);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

const production = await buildWith({
  VITE_SUPABASE_URL: 'https://uohziyaudbpwmupvljyd.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key-not-secret',
});
for (const marker of MARKERS) {
  assert.equal(production.includes(marker), false, `paczka produkcyjna bez atrapy (znacznik: ${marker})`);
}
assert.ok(production.includes('uohziyaudbpwmupvljyd.supabase.co'), 'paczka produkcyjna łączy się z prawdziwym Supabase');

const mock = await buildWith({ VITE_SUPABASE_MODE: 'mock' });
assert.ok(mock.includes('admin@wawis.test'), 'build testowy (E2E) nadal zawiera atrapę');
assert.ok(mock.includes('mock://supabase'), 'build testowy używa adresu atrapy');

console.log('PASS WAWIS 14.50 — atrapa bazy tylko w buildzie testowym (VITE_SUPABASE_MODE=mock); paczka produkcyjna bez mockSupabaseClient i danych testowych.');
