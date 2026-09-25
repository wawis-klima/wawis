import assert from 'node:assert/strict';
import { resolveNameplateOverviewRows } from '../src/modules/jobs-fetch.js';

const jobId = '42be940c-ed89-4f4a-ab14-795448624cf6';
const staleRows = [
  { id: 'old-jz', job_id: jobId, device_index: 1, unit_ref: 'jz', ocr_status: 'approved' },
  { id: 'old-jw', job_id: jobId, device_index: 1, unit_ref: 'jw-1', ocr_status: 'approved' },
];

// Gdy globalny odczyt tabliczek jeszcze trwa lub jest niedostępny,
// zachowujemy poprzedni stan, żeby lista nie migała na pusto.
assert.deepEqual(resolveNameplateOverviewRows({
  groupedRows: new Map(),
  jobId,
  previousRows: staleRows,
  overviewPending: true,
}), staleRows);

// Gdy serwer odpowiedział poprawnie i dla zlecenia nie ma żadnych rekordów,
// pusta odpowiedź jest stanem autorytatywnym. Nie wolno przywrócić starego cache.
assert.deepEqual(resolveNameplateOverviewRows({
  groupedRows: new Map(),
  jobId,
  previousRows: staleRows,
  overviewPending: false,
}), []);

// Świeże rekordy z serwera zawsze zastępują cache.
const freshRows = [{ id: 'fresh', job_id: jobId, device_index: 2, unit_ref: 'jz', ocr_status: 'approved' }];
assert.deepEqual(resolveNameplateOverviewRows({
  groupedRows: new Map([[jobId, freshRows]]),
  jobId,
  previousRows: staleRows,
  overviewPending: false,
}), freshRows);

console.log('PASS 11.50 desktop nameplate overview authority');
