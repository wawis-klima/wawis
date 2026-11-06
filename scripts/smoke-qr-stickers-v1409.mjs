// WAWIS 14.09 — naklejka QR w kreatorze urządzeń, kompaktowa karta montażu, naklejki przy usuwaniu urządzenia.
// Wykonuje rzeczywiste funkcje modułu qr-stickers.js na symulacji bazy zgodnej z funkcjami SQL 14.08.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as qr from '../src/modules/qr-stickers.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Symulacja: urządzenia montażu jako wiersze (indeks → id wiersza), naklejki przypisane do wierszy.
function fakeDb({ rows = 3, stickers = {}, known = ['AAAA2222', 'BBBB3333', 'CCCC4444', 'DDDD5555'] } = {}) {
  const deviceRows = Array.from({ length: rows }, (_, i) => `row-${i + 1}`);
  const assigned = new Map(Object.entries(stickers).map(([index, code]) => [code, deviceRows[Number(index) - 1]]));
  const calls = [];
  const supabase = {
    async rpc(name, args) {
      calls.push([name, args]);
      if (name === 'qr_stickers_for_job') {
        return { data: [...assigned].filter(([, row]) => row).map(([code, row]) => ({ device_index: deviceRows.indexOf(row) + 1, code })), error: null };
      }
      if (name === 'qr_sticker_unassign') { assigned.set(args.p_code, null); return { data: { ok: true }, error: null }; }
      if (name === 'qr_sticker_assign_job_device') {
        const row = deviceRows[args.p_device_index - 1];
        if (!row) return { data: { ok: false, reason: 'device_not_saved' }, error: null };
        if (!known.includes(args.p_code)) return { data: { ok: false, reason: 'unknown_code', code: args.p_code }, error: null };
        const current = assigned.get(args.p_code);
        if (current === row) return { data: { ok: true, already: true, code: args.p_code }, error: null };
        if (current) return { data: { ok: false, reason: 'sticker_taken', code: args.p_code, device: { device_index: deviceRows.indexOf(current) + 1 } }, error: null };
        const existing = [...assigned].find(([, r]) => r === row);
        if (existing) return { data: { ok: false, reason: 'device_has_sticker', code: args.p_code, existing_code: existing[0] }, error: null };
        assigned.set(args.p_code, row);
        return { data: { ok: true, code: args.p_code }, error: null };
      }
      if (name === 'qr_sticker_lookup') {
        if (!known.includes(args.p_code)) return { data: { ok: true, status: 'unknown', code: args.p_code }, error: null };
        const row = assigned.get(args.p_code);
        return { data: row ? { ok: true, status: 'assigned', code: args.p_code, device: { device_index: deviceRows.indexOf(row) + 1, client: 'Klient' } } : { ok: true, status: 'free', code: args.p_code }, error: null };
      }
      throw new Error(`nieobsługiwane ${name}`);
    },
  };
  // Usunięcie urządzenia N jak w bazie: dane N+1.. przesuwają się do wierszy N.., ostatni wiersz znika (naklejka zwolniona).
  const removeDevice = (index) => {
    const last = deviceRows.pop();
    for (const [code, row] of assigned) if (row === last) assigned.set(code, null);
    return { removed: index };
  };
  const stateByIndex = () => Object.fromEntries([...assigned].filter(([, row]) => row).map(([code, row]) => [deviceRows.indexOf(row) + 1, code]));
  return { supabase, calls, removeDevice, stateByIndex };
}

// ---------- 1. Usunięcie urządzenia: naklejki zostają przy fizycznych urządzeniach ----------
{
  // Bez poprawki (odtworzenie): po usunięciu Urządzenia 1 naklejka AAAA zostaje na wierszu 1, który teraz ma dane dawnego Urządzenia 2.
  const raw = fakeDb({ stickers: { 1: 'AAAA2222', 2: 'BBBB3333', 3: 'CCCC4444' } });
  raw.removeDevice(1);
  assert.deepEqual(raw.stateByIndex(), { 1: 'AAAA2222', 2: 'BBBB3333' }, 'Odtworzenie: naklejki wskazują złe urządzenia.');

  const db = fakeDb({ stickers: { 1: 'AAAA2222', 2: 'BBBB3333', 3: 'CCCC4444' } });
  const { result, qr: outcome } = await qr.preserveQrStickersAroundDeviceRemoval({
    supabase: db.supabase, jobId: 'job-1', removedIndex: 1, run: async () => db.removeDevice(1),
  });
  assert.deepEqual(result, { removed: 1 });
  assert.deepEqual(db.stateByIndex(), { 1: 'BBBB3333', 2: 'CCCC4444' }, 'Dawne Urządzenie 2 (teraz 1) ma swoją naklejkę.');
  assert.equal(outcome.freed, 'AAAA2222');
  assert.deepEqual(outcome.moved.map((m) => [m.code, m.to]), [['BBBB3333', 1], ['CCCC4444', 2]]);
  assert.equal(outcome.failures.length, 0);
  assert.match(qr.describeQrRealignment(outcome), /AAAA-2222 usuniętego urządzenia została zwolniona\..*BBBB-3333 → Urządzenie 1, CCCC-4444 → Urządzenie 2/);

  // Usunięcie ostatniego urządzenia: naklejki wcześniejszych bez zmian.
  const db2 = fakeDb({ stickers: { 1: 'AAAA2222', 3: 'CCCC4444' } });
  const r2 = await qr.preserveQrStickersAroundDeviceRemoval({ supabase: db2.supabase, jobId: 'job-1', removedIndex: 3, run: async () => db2.removeDevice(3) });
  assert.deepEqual(db2.stateByIndex(), { 1: 'AAAA2222' });
  assert.equal(r2.qr.freed, 'CCCC4444');
  assert.equal(r2.qr.moved.length, 0);

  // Montaż bez naklejek: tylko usunięcie, żadnych zapisów naklejek.
  const db3 = fakeDb();
  await qr.preserveQrStickersAroundDeviceRemoval({ supabase: db3.supabase, jobId: 'job-1', removedIndex: 1, run: async () => db3.removeDevice(1) });
  assert.deepEqual(db3.calls.map(([name]) => name), ['qr_stickers_for_job']);

  // Przed migracją (brak funkcji w bazie): usunięcie urządzenia działa jak dawniej.
  const noModule = { rpc: async () => ({ data: null, error: { message: 'Could not find the function public.qr_stickers_for_job (PGRST202)' } }) };
  const r4 = await qr.preserveQrStickersAroundDeviceRemoval({ supabase: noModule, jobId: 'job-1', removedIndex: 1, run: async () => 'ok' });
  assert.equal(r4.result, 'ok');
  assert.equal(qr.describeQrRealignment(r4.qr), '');

  // Błąd usunięcia: naklejek nie ruszamy.
  const db5 = fakeDb({ stickers: { 1: 'AAAA2222', 2: 'BBBB3333' } });
  await assert.rejects(qr.preserveQrStickersAroundDeviceRemoval({ supabase: db5.supabase, jobId: 'job-1', removedIndex: 1, run: async () => { throw new Error('odmowa'); } }), /odmowa/);
  assert.deepEqual(db5.stateByIndex(), { 1: 'AAAA2222', 2: 'BBBB3333' });
}

// ---------- 2. Kreator: sprawdzenie zeskanowanej naklejki przed zapisem ----------
{
  const db = fakeDb({ stickers: { 2: 'BBBB3333' } });
  const ok = await qr.validateWizardQrSticker({ supabase: db.supabase, code: 'aaaa-2222', deviceIndex: 0 });
  assert.deepEqual(ok, { code: 'AAAA2222', already: false });
  await assert.rejects(qr.validateWizardQrSticker({ supabase: db.supabase, code: 'ZZZZ7777', deviceIndex: 0 }), /nie pochodzi z naklejek WAWIS/);
  await assert.rejects(qr.validateWizardQrSticker({ supabase: db.supabase, code: 'BBBB3333', deviceIndex: 0, savedStickers: { 1: 'BBBB3333' } }), /jest już przypisana/);
  assert.deepEqual(await qr.validateWizardQrSticker({ supabase: db.supabase, code: 'BBBB3333', deviceIndex: 1, savedStickers: { 1: 'BBBB3333' } }), { code: 'BBBB3333', already: true });
  await assert.rejects(qr.validateWizardQrSticker({ supabase: db.supabase, code: 'AAAA2222', deviceIndex: 2, pendingStickers: { 0: 'AAAA2222' } }), /już wybrana dla Urządzenia 1/);
  await assert.rejects(qr.validateWizardQrSticker({ supabase: db.supabase, code: 'zly', deviceIndex: 0 }), /To nie jest kod naklejki WAWIS/);
}

// ---------- 3. Przypisanie po zapisie urządzeń ----------
{
  const db = fakeDb({ rows: 2, stickers: { 2: 'BBBB3333' } });
  const outcome = await qr.assignPendingJobQrStickers({ supabase: db.supabase, jobId: 'job-1', pending: { 0: 'AAAA2222', 1: 'CCCC4444', 2: 'DDDD5555', x: 'AAAA2222' } });
  assert.deepEqual(outcome.assigned, [{ index: 0, code: 'AAAA2222' }]);
  assert.deepEqual(outcome.failures.map((f) => [f.index, f.code]), [[1, 'CCCC4444'], [2, 'DDDD5555']]);
  assert.match(outcome.failures[0].message, /ma już naklejkę BBBB-3333/);
  assert.match(outcome.failures[1].message, /nie jest jeszcze zapisane/);
  assert.deepEqual(db.calls.filter(([n]) => n === 'qr_sticker_assign_job_device').map(([, a]) => a.p_device_index), [1, 2, 3], 'Numery urządzeń od 1.');
}

// ---------- 4. Podłączenie ----------
const wizard = read('src/mobile791/components/devices/MobileDeviceWizard.jsx');
assert.equal((wizard.match(/\{renderQrCard\(\)\}/g) || []).length, 2, 'Karta naklejki w trybie Single i Multi (jedna na zestaw).');
assert.match(wizard, /qr\.required \? 'wymagana' : 'opcjonalnie'/, 'Napis zależny od wymogu (od 14.26 wymagana).');
assert.match(wizard, /Bez naklejki QR/);
const modal = read('src/mobile791/components/modals/JobFormModal.jsx');
// 14.26 (nowa decyzja właściciela 06.11.2026, zastępuje 02.11.2026): naklejka wymagana po odczycie naklejek z bazy.
assert.match(modal, /required: qrSavedLoaded \}/, 'Naklejka wymagana (decyzja właściciela 06.11.2026).');
assert.match(modal, /pending_qr_stickers: pendingQr/, 'Zeskanowane naklejki przesuwają się przy usuwaniu urządzenia w kreatorze.');
assert.match(modal, /validateWizardQrSticker\(\{/);
assert.match(read('src/mobile791/hooks/useJobFormModal.js'), /pending_qr_stickers: Object\.entries/);
const actions = read('src/mobile791/hooks/useSelectedJobActions.js');
const recordDone = actions.indexOf("logDiagnostic('nameplate.save.record.completed'");
const qrAssign = actions.indexOf('assignPendingJobQrStickers({ supabase, jobId: editingJobId');
assert.ok(recordDone > 0 && qrAssign > recordDone, 'Naklejki przypisywane dopiero po zapisie urządzeń.');
assert.ok(qrAssign < actions.indexOf('const uploadPromise = uploadJobDocumentationPhotos'), 'Przed wysyłką zdjęć (nie blokuje zdjęć).');
for (const file of ['src/mobile791/hooks/useSelectedJobActions.js', 'src/hooks/useSelectedJobActions.js']) {
  const src = read(file);
  assert.match(src, /preserveQrStickersAroundDeviceRemoval\(\{[\s\S]*?run: \(\) => deleteJobDeviceRecord\(\{/, `${file}: usunięcie urządzenia zachowuje naklejki`);
  assert.match(src, /Naklejka QR usuwanego urządzenia zostanie zwolniona/);
}
const row = read('src/mobile791/components/qr/JobDeviceQrSticker.jsx');
assert.doesNotMatch(row, /Zeskanowanie naklejki otworzy to urządzenie/, 'Karta montażu bez długiego opisu (kompaktowo).');
assert.match(read('src/mobile791/components/qr/QrStickerScanner.css'), /\.qrStickerRow \.btn\.qrStickerBtn \{ min-height: 32px !important;/);

console.log('WAWIS 14.09 QR stickers wizard/realign: PASS');
