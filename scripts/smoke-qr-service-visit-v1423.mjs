// WAWIS 14.23 — naklejka QR podczas przeglądu (decyzja właściciela 06.11.2026): każdy pracownik na serwisie
// (także drugi, nieprzydzielony) przykleja WOLNĄ naklejkę na urządzenie z wizyty, które nie ma naklejki.
// SQL sprawdza scripts/qr-service-visit-sql-v1423.sh (prawdziwy PostgreSQL). RED na 14.22.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as qr from '../src/modules/qr-stickers.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// 1. Wywołania RPC.
const calls = [];
const fake = (data, error = null) => ({ rpc: async (name, args) => { calls.push([name, args]); return { data, error }; } });
await qr.assignQrStickerToServiceDevice({ supabase: fake({ ok: true }), code: 'uye8-eycq', visitId: 'v1', itemId: 'i1' });
assert.deepEqual(calls.at(-1), ['qr_sticker_assign_service_device_v1423', { p_code: 'UYE8EYCQ', p_visit_id: 'v1', p_item_id: 'i1' }]);
assert.deepEqual(await qr.loadServiceVisitQrStickers({ supabase: fake([{ item_id: 'i1', code: 'BNKJXZDY' }]), visitId: 'v1' }), { i1: 'BNKJXZDY' });
assert.deepEqual(calls.at(-1), ['qr_stickers_for_service_visit_v1423', { p_visit_id: 'v1' }]);
assert.deepEqual(await qr.loadServiceVisitQrStickers({ supabase: fake([]), visitId: '' }), {}, 'bez wizyty bez zapytania');
await assert.rejects(qr.loadServiceVisitQrStickers({ supabase: fake(null, { message: 'boom' }), visitId: 'v1' }), (e) => /boom/.test(e.message), 'błąd nie wygląda jak „brak naklejek”');
await assert.rejects(qr.assignQrStickerToServiceDevice({ supabase: fake(null, { message: 'Could not find the function public.qr_sticker_assign_service_device_v1423 (PGRST202)' }), code: 'UYE8EYCQ', visitId: 'v', itemId: 'i' }),
  /wymaga aktualizacji bazy \(14\.23\)/, 'przed migracją: czytelny komunikat');

// 2. Komunikaty.
assert.match(qr.describeQrAssignFailure({ reason: 'visit_cancelled' }), /odwołany/);
assert.match(qr.describeQrAssignFailure({ reason: 'visit_item_not_found' }), /nie należy do tego przeglądu/);
assert.match(qr.describeQrAssignFailure({ reason: 'visit_not_found' }), /Nie znaleziono przeglądu/);
assert.match(qr.describeQrAssignFailure({ reason: 'sticker_taken', code: 'UYE8EYCQ', can_replace: false, device: { client: 'Kowalski' } }), /Przepisać ją może tylko administrator/);

// 3. Ekran wykonania przeglądu.
const panel = read('src/mobile791/components/devices/ServiceExecutionPanel.jsx');
assert.match(panel, /assignQrStickerToServiceDevice\(\{supabase,code,visitId,itemId:item\.id\}\)/);
assert.match(panel, /data-testid="service-execution-qr-sticker"/);
assert.match(panel, /qrCodes&&!qrCodes\[item\.id\]&&visit\.status!=='odwolany'\?<button/, 'przycisk tylko przy urządzeniu bez naklejki, poza odwołaną wizytą');
assert.match(panel, /qrCodes==='error'\?'nie udało się sprawdzić'/, 'błąd odczytu nie udaje „brak”');
assert.match(panel, /<QrStickerScanner open=\{Boolean\(qrTarget\)\}/);
assert.doesNotMatch(panel, /qr_sticker_unassign|unassignQrSticker|replace: ?true/, 'bez wymiany i zwalniania na ekranie przeglądu');

// 4. Migracja: każdy pracownik, bez wymiany, bez zmian tabel.
const sql = read('supabase/migrations/20261106090000_qr_sticker_przeglad_v1423.sql');
assert.match(sql, /if not public\.current_user_is_staff\(\) then/);
assert.doesNotMatch(sql, /primary_technician_id|additional_technician_ids/, 'nie tylko przydzielony pracownik');
assert.match(sql, /return private\.qr_sticker_assign\(p_code, v_device, false\);/);
assert.doesNotMatch(sql, /\b(alter|drop|delete|update|insert|truncate)\b/i, 'tylko nowe funkcje');
assert.match(read('supabase/rebuild/manifest-v1089.json'), /20261106090000_qr_sticker_przeglad_v1423\.sql/);
assert.match(read('scripts/codex-postgres-two-sessions-v1269.sh'), /bash "\$ROOT\/scripts\/qr-service-visit-sql-v1423\.sh"/, 'test SQL w CI');

console.log('PASS WAWIS 14.23 — naklejka QR podczas przeglądu: każdy pracownik, tylko wolna naklejka, bez wymiany.');
