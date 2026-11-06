// WAWIS 14.24 — decyzje właściciela 06.11.2026: naklejka QR wymagana do zakończenia montażu i przeglądu
// przez pracownika (administrator może zakończyć — jak tabliczki); „Szukaj w GUS” przy NIP w formularzu montażu.
// SQL: scripts/job-completion-qr-sql-v1424.sh (prawdziwy wyzwalacz). E2E: job-qr-required-v1424.spec.js. RED na 14.23.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as qr from '../src/modules/qr-stickers.js';
import { normalizeDatabaseErrorMessage as mobileDbMessage } from '../src/mobile791/modules/database-errors.js';
import { normalizeDatabaseErrorMessage as desktopDbMessage } from '../src/modules/database-errors.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// 1. Brakujące naklejki.
assert.deepEqual(qr.missingJobQrStickers({ deviceCount: 3, stickers: { 1: 'UYE8EYCQ', 3: 'BNKJXZDY' } }), [2]);
assert.deepEqual(qr.missingJobQrStickers({ deviceCount: 2, stickers: {} }), [1, 2]);
assert.deepEqual(qr.missingJobQrStickers({ deviceCount: 0, stickers: {} }), [], 'bez urządzeń bez wymogu');
assert.deepEqual(qr.missingJobQrStickers({ deviceCount: 1, stickers: { 1: ' ' } }), [1]);
assert.equal(qr.formatMissingQrDevices([2]), 'urządzenie 2');
assert.equal(qr.formatMissingQrDevices([1, 3]), 'urządzenia 1, 3');
assert.match(qr.describeQrStickerRequired([1, 2]), /^Nie można zakończyć zlecenia\. Przypisz naklejkę QR \(urządzenia 1, 2\)/);

// 2. Błąd bazy → czytelny komunikat (telefon i komputer).
const dbError = { message: 'job_qr_sticker_required: 2', code: '23514' };
assert.deepEqual(qr.parseQrStickerRequiredError(dbError), [2]);
assert.equal(qr.parseQrStickerRequiredError({ message: 'job_protocol_required: x' }), null);
for (const fn of [mobileDbMessage, desktopDbMessage]) {
  assert.match(fn(dbError), /Przypisz naklejkę QR \(urządzenie 2\)/);
  assert.match(fn({ message: 'job_qr_sticker_required: 1, 3' }), /\(urządzenia 1, 3\)/);
}

// 3. Montaż (iPhone): krok przed protokołem i zakończeniem, tylko pracownik; nieodczytane ≠ brak.
const panel = read('src/mobile791/components/JobDetailsPanel.jsx');
assert.match(panel, /const qrStickersRequired = Boolean\(selectedJob\) && !isAdmin && !selectedJobIsCompleted && canWorkerFinishJob\(selectedJob, isAdmin\);/);
assert.match(panel, /const qrStickersChecked = Boolean\(selectedJobId\) && jobQr\.loadedJobId === selectedJobId && jobQr\.available;/);
assert.match(panel, /const protocolStepsReady = protocolNameplatesReady && protocolQrReady;/);
assert.match(panel, /disabled=\{busy \|\| !protocolStepsReady\}/, 'Protokół zablokowany bez naklejek');
assert.match(panel, /!protocolNameplatesReady \|\| !protocolQrReady \|\| !protocolReadyForCompletion/, 'Zakończ zablokowane bez naklejek');
assert.match(panel, /open=\{protocolTestOpen && protocolStepsReady\}/);
assert.match(panel, /data-testid="finish-qr-step-missing"/);
assert.match(panel, /data-testid="finish-qr-admin-note"/);
const hook = read('src/mobile791/components/qr/JobDeviceQrSticker.jsx');
assert.match(hook, /setLoadedJobId\(String\(jobId\)\);/);
assert.match(hook, /return \{ stickers, available, reload, setStickers, loadedJobId \};/);
const actions = read('src/mobile791/hooks/useSelectedJobActions.js');
assert.match(actions, /if \(completingNow && workerFinishing\) \{\s+let qrMissing = \[\];/);
assert.match(actions, /alert\(describeQrStickerRequired\(qrMissing\)\);/);

// 4. Baza: tylko pracownik, tylko przy zmianie statusu; tabliczki i protokół bez zmian.
const sql = read('supabase/migrations/20261106120000_job_completion_qr_sticker_v1424.sql');
assert.match(sql, /raise exception 'job_qr_sticker_required: %'/);
assert.match(sql, /-- 14\.24: naklejka QR[^\n]*\n\s+if not public\.current_user_is_admin\(\)\n\s+and \(tg_op = 'INSERT' or old\.status is distinct from new\.status\) then/);
assert.match(sql, /raise exception 'job_protocol_required: zapisz podpisany protokół przed zakończeniem zlecenia'/, 'protokół bez zmian');
assert.match(sql, /perform private\.assert_job_nameplates_complete\(new\.id, new\.device_model, new\.device_serial_number\);/, 'tabliczki bez zmian');
assert.doesNotMatch(sql, /\b(alter table|drop |delete from|update public|insert into|truncate)\b/i, 'bez zmian tabel i danych');
assert.match(read('supabase/rebuild/manifest-v1089.json'), /20261106120000_job_completion_qr_sticker_v1424\.sql/);
assert.match(read('scripts/codex-postgres-two-sessions-v1269.sh'), /bash "\$ROOT\/scripts\/job-completion-qr-sql-v1424\.sh"/);

// 5. Przegląd: pracownik bez naklejek nie podpisze i nie zakończy; administrator po potwierdzeniu.
const service = read('src/mobile791/components/devices/ServiceExecutionPanel.jsx');
assert.match(service, /const qrBlocksWorker=!isAdmin&&qrItems\.length>0&&\(!qrChecked\|\|qrMissingItems\.length>0\);/);
assert.equal((service.match(/\|\|qrBlocksWorker\}/g) || []).length, 2, 'podpis i zakończenie');
assert.match(service, /if\(!isAdmin\)\{setError\(qrBlockMessage\);return;\}/);
assert.match(service, /window\.confirm\('Brak naklejki QR: '/);
assert.match(read('src/mobile791/components/devices/ServiceAdminPanel.jsx'), /visitId=\{currentVisit\.id\} isAdmin=\{isAdmin\}/);

// 6. NIP: „Szukaj w GUS” w formularzu montażu (telefon i komputer), ponowienie po otwarciu formularza.
for (const path of ['src/mobile791/components/modals/JobFormModal.jsx', 'src/components/modals/JobFormModal.jsx']) {
  const form = read(path);
  assert.match(form, /async function handleManualGusLookup\(\)/, path);
  assert.match(form, /\{gusLookupBusy \? 'Szukam…' : 'Szukaj w GUS'\}/, path);
  assert.match(form, /if \(showModal\) gusLookupAttemptRef\.current = '';/, path);
  assert.match(form, /Klient z tym NIP-em jest już w bazie — wybrano go\./, path);
}

// 7. Testowa baza: montaże A–D z naklejkami (scenariusze zakończenia), Multi-Split i 3 kody wolne.
const mock = read('src/mobile791/lib/mockSupabaseClient.js');
assert.match(mock, /\['MKAAAA2B', 'mock-device-002'\]/);
assert.match(mock, /\['UYE8EYCQ', 'BNKJXZDY', 'CXFBEHEP'\]\.map\(\(code\) => \(\{ code, device_id: null \}\)\)/);

console.log('PASS WAWIS 14.24 — naklejka QR do zakończenia montażu i przeglądu (pracownik), „Szukaj w GUS” w formularzu montażu.');
