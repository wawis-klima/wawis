const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src/mobile791/hooks/useSelectedJobActions.js');
const source = fs.readFileSync(file, 'utf8');
const required = [
  'NAMEPLATE_SAVE_TIMEOUT_MS = 15000',
  'NAMEPLATE_VERIFY_TIMEOUT_MS = 8000',
  "logDiagnostic('nameplate.save.upload.timeout'",
  "logDiagnostic('nameplate.save.modal.closed.after-timeout-confirmation'",
  "logDiagnostic('nameplate.save.refresh.timeout'",
  'verifyPendingNameplatesOnServer',
  'verifyNameplatesWithRecovery',
  'retryQueuedJobPhoto({',
  'nameplate.save.recovery.finished',
  "verifyPendingNameplatesWithRecovery(editingJobId, preparedPendingDocuments, 'upload-completed'",
  "reason: 'server-verification-incomplete'",
  'Aplikacja ponowiła kontrolę i próbę wysyłki.',
  'resetJobModalState();',
  "refreshAfterNameplateSave(editingJobId, 'save-confirmed')",
];
for (const marker of required) {
  if (!source.includes(marker)) throw new Error(`Brak zabezpieczenia zapisu tabliczek: ${marker}`);
}
const finalVerificationIndex = source.indexOf("verifyPendingNameplatesWithRecovery(editingJobId, preparedPendingDocuments, 'upload-completed'");
const closeIndex = source.indexOf("logDiagnostic('nameplate.save.modal.closed', { jobId: editingJobId");
const refreshIndex = source.indexOf("refreshAfterNameplateSave(editingJobId, 'save-confirmed')", closeIndex);
if (finalVerificationIndex < 0 || closeIndex < 0 || refreshIndex < 0 || finalVerificationIndex > closeIndex || closeIndex > refreshIndex) {
  throw new Error('Modal musi zostać zamknięty przed odświeżeniem danych w tle.');
}
console.log('OK: mobilny zapis tabliczek zamyka modal po potwierdzeniu i odświeża w tle z timeoutem.');


async function verifyRecoveryBehavior() {
  const assert = require('node:assert/strict');
  const { pathToFileURL } = require('node:url');
  const moduleUrl = pathToFileURL(path.join(process.cwd(), 'src/mobile791/modules/nameplate-save-recovery.js')).href;
  const { verifyNameplatesWithRecovery } = await import(moduleUrl);

  let checks = 0; let reuploads = 0;
  const recovered = await verifyNameplatesWithRecovery({
    verify: async () => ++checks === 2,
    retryUpload: () => { reuploads += 1; },
    delaysMs: [1, 2],
    wait: async () => {},
  });
  assert.deepEqual(recovered, { confirmed: true, attempts: 2, reason: 'confirmed-after-retry' });
  assert.equal(reuploads, 1);

  checks = 0; reuploads = 0;
  const exhausted = await verifyNameplatesWithRecovery({
    verify: async () => { checks += 1; return false; },
    retryUpload: () => { reuploads += 1; },
    delaysMs: [1, 2],
    wait: async () => {},
  });
  assert.deepEqual(exhausted, { confirmed: false, attempts: 3, reason: 'not-confirmed' });
  assert.equal(reuploads, 1);

  checks = 0; reuploads = 0;
  const offline = await verifyNameplatesWithRecovery({
    verify: async () => { checks += 1; return false; },
    retryUpload: () => { reuploads += 1; },
    online: () => false,
  });
  assert.deepEqual(offline, { confirmed: false, attempts: 1, reason: 'offline' });
  assert.equal(reuploads, 0);

  checks = 0;
  const aborted = await verifyNameplatesWithRecovery({
    verify: async () => { if (++checks === 1) throw new Error('AbortError'); return true; },
    delaysMs: [1],
    wait: async () => {},
  });
  assert.equal(aborted.confirmed, true);
  console.log('OK: weryfikacja po timeout, bez duplikowania ponowien, offline nie zamyka formularza.');
}
verifyRecoveryBehavior().catch((error) => { console.error(error); process.exitCode = 1; });
