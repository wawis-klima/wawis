// WAWIS 13.99 — zapis szczegółów wizyty „wszystko albo nic” i usuwanie pomyłkowego zdjęcia.
// Wykonuje rzeczywisty kod modułów; zachowanie bazy sprawdza scripts/service-visit-sql-v1399.sh (PostgreSQL).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { updateAdminServiceVisitDetails } from '../src/mobile791/modules/service-visits.js';
import { deleteServiceVisitPhoto } from '../src/mobile791/modules/service-visit-execution.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function setOnline(value) {
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: value }, configurable: true, writable: true });
}

// ---------- 1. Jeden zapis terminu, uwag i obsady (SV-1399-ATOMIC) ----------
function fakeVisitsDb(result) {
  const updates = [];
  return { updates, from(table) {
    assert.equal(table, 'service_visits');
    return {
      update(values) { updates.push(values); return this; },
      eq(field, value) { assert.deepEqual([field, value], ['id', 'V1']); return this; },
      select() { return this; },
      single: async () => result,
    };
  } };
}
setOnline(true);
let db = fakeVisitsDb({ data: { id: 'V1' }, error: null });
await updateAdminServiceVisitDetails({ supabase: db, visitId: 'V1', date: '2026-11-02', time: '',
  notes: '  Ustalono telefonicznie  ', technicianIds: ['piotr', 'pawel', 'piotr', null] });
assert.equal(db.updates.length, 1, 'Termin i obsada w JEDNYM zapisie (wcześniej dwa osobne UPDATE).');
assert.deepEqual(db.updates[0], {
  scheduled_date: '2026-11-02', scheduled_time: null, notes: 'Ustalono telefonicznie',
  primary_technician_id: 'piotr', additional_technician_ids: ['pawel'],
}, 'Pierwszy zaznaczony = główny, bez duplikatów, pusta godzina = null.');
db = fakeVisitsDb({ data: { id: 'V1' }, error: null });
await updateAdminServiceVisitDetails({ supabase: db, visitId: 'V1', date: '2026-11-02', time: '09:30', notes: '', technicianIds: [] });
assert.equal(db.updates[0].primary_technician_id, null, 'Brak zaznaczeń = bez przydziału.');
assert.deepEqual(db.updates[0].additional_technician_ids, []);
db = fakeVisitsDb({ data: null, error: { message: 'Serwis jest w koszu. Przywróć go, aby wprowadzić zmiany.', code: '55000' } });
await assert.rejects(updateAdminServiceVisitDetails({ supabase: db, visitId: 'V1', date: '2026-11-02', technicianIds: ['a'] }),
  { message: /w koszu/ }, 'Odmowa serwera nie wygląda jak sukces.');
db = fakeVisitsDb({ data: null, error: null });
await assert.rejects(updateAdminServiceVisitDetails({ supabase: db, visitId: 'V1', date: '2026-11-02' }), /potwierdzenia/);
setOnline(false);
db = fakeVisitsDb({ data: { id: 'V1' }, error: null });
await assert.rejects(updateAdminServiceVisitDetails({ supabase: db, visitId: 'V1', date: '2026-11-02' }), /Brak internetu/);
assert.equal(db.updates.length, 0, 'Bez internetu nic nie jest wysyłane.');
setOnline(true);

const admin = read('src/mobile791/components/devices/ServiceAdminPanel.jsx');
const saveSrc = admin.match(/async function saveAssignment\(event\) \{[\s\S]*?\n  \}\n/)?.[0] || '';
assert.ok(saveSrc, 'saveAssignment istnieje');
assert.match(saveSrc, /updateAdminServiceVisitDetails\(\{supabase,visitId:currentVisit\.id,date,time,notes,technicianIds:selectedTechnicians\}\)/);
assert.doesNotMatch(saveSrc, /from\('service_visits'\)|updateAdminServiceAssignment/, 'Brak drugiego, osobnego zapisu przydziału.');

// ---------- 2. Usunięcie pomyłkowego zdjęcia (SV-1399-PHOTO-DELETE) ----------
function fakePhotoDb({ rpc, remove }) {
  const calls = [];
  return { calls,
    rpc: async (name, args) => { calls.push(['rpc', name, args]); return rpc; },
    storage: { from(bucket) { return { remove: async paths => { calls.push(['remove', bucket, paths]); return remove; } }; } },
  };
}
let pdb = fakePhotoDb({ rpc: { data: 'V1/photos/I1/a.jpg', error: null }, remove: { data: [{}], error: null } });
assert.deepEqual(await deleteServiceVisitPhoto({ supabase: pdb, photoId: 'P1' }), { deleted: true, fileRemoved: true });
assert.deepEqual(pdb.calls, [
  ['rpc', 'service_visit_admin_delete_photo', { p_photo_id: 'P1' }],
  ['remove', 'service-visit-files', ['V1/photos/I1/a.jpg']],
], 'Najpierw wpis na serwerze, potem plik — dokładnie ścieżka zwrócona przez serwer.');
pdb = fakePhotoDb({ rpc: { data: null, error: { message: 'Zdjęcie można usunąć tylko przed podpisaniem i zakończeniem wizyty' } }, remove: { error: null } });
await assert.rejects(deleteServiceVisitPhoto({ supabase: pdb, photoId: 'P1' }), { message: /przed podpisaniem/ });
assert.equal(pdb.calls.length, 1, 'Odmowa serwera = plik nietknięty.');
pdb = fakePhotoDb({ rpc: { data: 'V1/photos/I1/a.jpg', error: null }, remove: { data: null, error: { message: 'network' } } });
assert.deepEqual(await deleteServiceVisitPhoto({ supabase: pdb, photoId: 'P1' }), { deleted: true, fileRemoved: false },
  'Błąd Storage po usunięciu wpisu: tylko nieużywany plik, zgłoszony uczciwie.');
pdb = fakePhotoDb({ rpc: { data: null, error: null }, remove: { error: null } });
await assert.rejects(deleteServiceVisitPhoto({ supabase: pdb, photoId: 'P1' }), /nie potwierdził/);
assert.equal(pdb.calls.length, 1, 'Bez ścieżki z serwera nie kasujemy żadnego pliku.');
setOnline(false);
pdb = fakePhotoDb({ rpc: { data: 'x', error: null }, remove: { error: null } });
await assert.rejects(deleteServiceVisitPhoto({ supabase: pdb, photoId: 'P1' }), /Brak internetu/);
assert.equal(pdb.calls.length, 0);
setOnline(true);

const exec = read('src/mobile791/components/devices/ServiceExecutionPanel.jsx');
const removeSrc = exec.match(/async function removePhoto\(item,photo,index\) \{[\s\S]*?\n \}\n/)?.[0] || '';
assert.ok(removeSrc, 'removePhoto istnieje');
assert.equal((removeSrc.match(/window\.confirm\(/g) || []).length, 1, 'Jedno potwierdzenie usunięcia zdjęcia.');
assert.match(removeSrc, /setSignatureDataUrl\(''\)/, 'Usunięcie zdjęcia unieważnia zatwierdzony podpis.');
// 14.02: przycisk „Usuń” w karcie zdjęcia (jak w montażach), tylko przed zakończeniem wizyty.
assert.match(exec, /\{!readonly\?<button type="button" className="btn premiumActionBtn premiumDangerBtn photoDeleteBtn compactDangerBtn"[\s\S]{0,200}?onClick=\{e=>\{e\.stopPropagation\(\);removePhoto\(item,p,i\);\}\}/,
  'Przycisk „Usuń” tylko przed zakończeniem wizyty.');

// ---------- 3. Migracja (pomocniczo; zachowanie sprawdza test PostgreSQL) ----------
const sql = read('supabase/migrations/20261030120000_service_visit_trash_guard_photo_delete_v1399.sql');
assert.doesNotMatch(sql, /delete\s+from\s+storage\.objects/i, 'Pliki tylko przez Storage API.');
assert.doesNotMatch(sql, /drop\s+table|truncate|delete\s+from\s+public\.service_visits\b/i, 'Migracja niedestrukcyjna.');
assert.match(read('scripts/codex-postgres-two-sessions-v1269.sh'), /scripts\/service-visit-sql-v1399\.sh/, 'Test PostgreSQL podpięty do CI.');

console.log('WAWIS 13.99 service admin atomic save + photo delete: PASS');
