// WAWIS 14.27 — uzupełnienie partii 2 naklejek QR o 18 kodów (4 pełne strony wydruku 35 × 30 mm).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeQrStickerCode } from '../src/modules/qr-stickers.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const csvCodes = (file) => read(file).trim().split(/\r?\n/).slice(1).map((line) => line.split(';'));
const p1 = csvCodes('docs/naklejki-qr/partia-1-kody.csv').map((r) => r[1]);
const p2 = csvCodes('docs/naklejki-qr/partia-2-kody.csv').map((r) => r[1]);
const fill = csvCodes('docs/naklejki-qr/partia-2-uzupelnienie-kody.csv');
assert.equal(fill.length, 18, '18 nowych kodów');
assert.equal((p2.length + fill.length) % 45, 0, 'Partia 2 wypełnia pełne strony A4 (45 naklejek 35 × 30 mm).');
const all = [...p1, ...p2, ...fill.map((r) => r[1])];
assert.equal(new Set(all).size, all.length, 'Brak powtórzeń z partiami 1 i 2.');
const migration = read('supabase/migrations/20261106100000_qr_stickers_batch2_fill_v1427.sql');
for (const [, code, label, url] of fill) {
  assert.equal(normalizeQrStickerCode(code), code, `alfabet ${code}`);
  assert.equal(normalizeQrStickerCode(label), code);
  assert.equal(normalizeQrStickerCode(url), code);
  assert.ok(migration.includes(`('${code}','partia-2')`), `kod ${code} w migracji`);
}
assert.equal((migration.match(/\('[2-9A-HJKMNP-Z]{8}','partia-2'\)/g) || []).length, 18, 'Migracja dodaje dokładnie 18 kodów.');
assert.match(migration, /on conflict \(code\) do nothing;/, 'Ponowne wykonanie bez zmian.');
assert.doesNotMatch(migration, /\b(delete|update|drop|alter|grant|revoke|truncate)\b/i, 'Tylko dopisanie kodów.');
console.log('WAWIS 14.27 QR batch 2 fill: PASS');
