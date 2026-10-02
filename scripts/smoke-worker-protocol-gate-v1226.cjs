const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const migration = read('supabase', 'migrations', '20261002142000_worker_protocol_before_completion_v1226.sql');
const panel = read('src', 'mobile791', 'components', 'JobDetailsPanel.jsx');
const storage = read('src', 'mobile791', 'modules', 'job-protocol-storage.js');
const modal = read('src', 'mobile791', 'components', 'modals', 'ProtocolTestModal.jsx');
const errors = read('src', 'mobile791', 'modules', 'database-errors.js');

assert.match(migration, /current_user_can_write_job_protocol/);
assert.match(migration, /'w trakcie', 'zakończone'/i);
assert.match(migration, /job_protocol_required/);
assert.match(migration, /not public\.current_user_is_admin\(\)/);
assert.match(migration, /storage\.objects[\s\S]*o\.name = p\.storage_path/);
assert.match(migration, /job_protocols_insert_completed_job[\s\S]*current_user_can_write_job_protocol\(job_id\)/);
assert.match(migration, /job_protocols_storage_insert_completed_job[\s\S]*current_user_can_write_job_protocol/);

assert.match(panel, /const workerProtocolRequired = !isAdmin && canFinishJob/);
assert.match(panel, /const protocolReadyForCompletion = !workerProtocolRequired \|\| Boolean\(protocolRecord\)/);
assert.match(panel, /disabled=\{busy \|\| showDetailsLoading \|\| !effectiveNameplateComplete \|\| !protocolReadyForCompletion/);
assert.match(panel, /Najpierw wypełnij, podpisz i zapisz protokół klienta/);
assert.match(panel, /selectedJobSupportsProtocol = selectedJobIsCompleted \|\| \(!isAdmin && selectedJobStatus === "W trakcie"\)/);

assert.match(storage, /\["W trakcie", "Zakończone"\]\.includes\(status\)/);
assert.match(modal, /Wypełnij, podpisz i zapisz protokół przed zakończeniem montażu/);
assert.match(errors, /job_protocol_required/i);
assert.match(errors, /Najpierw wypełnij, podpisz i zapisz protokół klienta/);

console.log('PASS worker protocol completion gate v12.26');
