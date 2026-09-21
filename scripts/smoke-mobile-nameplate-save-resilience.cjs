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
  "verifyPendingNameplatesOnServer(editingJobId, pendingDocuments, 'upload-completed')",
  "reason: 'server-verification-incomplete'",
  'Nie wszystkie tabliczki zostały potwierdzone na serwerze.',
  'resetJobModalState();',
  "refreshAfterNameplateSave(editingJobId, 'save-confirmed')",
];
for (const marker of required) {
  if (!source.includes(marker)) throw new Error(`Brak zabezpieczenia zapisu tabliczek: ${marker}`);
}
const finalVerificationIndex = source.indexOf("verifyPendingNameplatesOnServer(editingJobId, pendingDocuments, 'upload-completed')");
const closeIndex = source.indexOf("logDiagnostic('nameplate.save.modal.closed', { jobId: editingJobId");
const refreshIndex = source.indexOf("refreshAfterNameplateSave(editingJobId, 'save-confirmed')", closeIndex);
if (finalVerificationIndex < 0 || closeIndex < 0 || refreshIndex < 0 || finalVerificationIndex > closeIndex || closeIndex > refreshIndex) {
  throw new Error('Modal musi zostać zamknięty przed odświeżeniem danych w tle.');
}
console.log('OK: mobilny zapis tabliczek zamyka modal po potwierdzeniu i odświeża w tle z timeoutem.');
