const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const desktopModal = read('src/components/modals/JobFormModal.jsx');
const mobileModal = read('src/mobile791/components/modals/JobFormModal.jsx');
const desktopJobs = read('src/modules/jobs-form.js');
const mobileJobs = read('src/mobile791/modules/jobs-form.js');
const desktopHook = read('src/hooks/useJobFormModal.js');
const mobileHook = read('src/mobile791/hooks/useJobFormModal.js');
const desktopActions = read('src/hooks/useSelectedJobActions.js');
const mobileActions = read('src/mobile791/hooks/useSelectedJobActions.js');
const migration = read('supabase/migrations/current/20260930171655_job_contractor_nip_v1194.sql');

assert.match(desktopModal, /NIP \(opcjonalnie\)/, 'Desktop musi mieć opcjonalne pole NIP.');
assert.match(mobileModal, /NIP \(opcjonalnie\)/, 'Mobile musi mieć opcjonalne pole NIP.');
assert.match(desktopModal, /nip:\s*contractor\.nip \|\| ''/, 'Desktop ma pobierać NIP wybranego kontrahenta.');
assert.match(mobileModal, /nip:\s*contractor\.nip \|\| ''/, 'Mobile ma pobierać NIP wybranego kontrahenta.');
assert.match(desktopJobs, /nip:\s*''/, 'Desktopowy formularz musi mieć pole nip.');
assert.match(mobileJobs, /nip:\s*''/, 'Mobilny formularz musi mieć pole nip.');
assert.match(desktopJobs, /save_job_contractor_nip/, 'Desktop musi zapisywać NIP przez bezpieczny RPC.');
assert.match(mobileJobs, /save_job_contractor_nip/, 'Mobile musi zapisywać NIP przez bezpieczny RPC.');
assert.match(mobileJobs, /p_nip:\s*normalizeJobText\(form\.nip\) \|\| null/, 'Admin mobile ma przekazywać NIP przy tworzeniu kontrahenta.');
assert.match(desktopHook, /nip:\s*String\(form\?\.nip/, 'Desktop dirty guard musi uwzględniać NIP.');
assert.match(mobileHook, /nip:\s*String\(form\?\.nip/, 'Mobile dirty guard musi uwzględniać NIP.');
assert.match(desktopActions, /nip:\s*linkedContractor\?\.nip \|\| ''/, 'Desktop edycja ma wczytać zapisany NIP.');
assert.match(mobileActions, /nip:\s*linkedContractor\?\.nip \|\| ''/, 'Mobile edycja ma wczytać zapisany NIP.');
assert.match(migration, /security definer[\s\S]*set search_path = ''/i, 'RPC NIP musi mieć zamknięty search_path.');
assert.match(migration, /revoke all on function public\.save_job_contractor_nip\(uuid, text\) from public/i, 'RPC NIP nie może być dostępny przez PUBLIC.');
assert.match(migration, /revoke execute on function public\.save_job_contractor_nip\(uuid, text\) from anon/i, 'RPC NIP nie może być dostępny dla anon.');
assert.match(migration, /v_role = 'Pracownik'[\s\S]*NIP klienta jest już zapisany inaczej/, 'Pracownik nie może nadpisać istniejącego innego NIP-u.');

console.log('OK: v11.94 NIP w formularzu desktop/mobile i bezpieczny zapis kontrahenta.');
