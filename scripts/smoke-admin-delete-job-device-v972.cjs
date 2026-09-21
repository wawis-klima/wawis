const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const migration = read('supabase/migrations/20260826152000_admin_delete_job_device.sql');
const helper = read('src/modules/job-device-delete.js');
const mobileHelper = read('src/mobile791/modules/job-device-delete.js');
const desktopActions = read('src/hooks/useSelectedJobActions.js');
const mobileActions = read('src/mobile791/hooks/useSelectedJobActions.js');
const desktopDetails = read('src/components/JobDetailsPanel.jsx');
const desktopCards = read('src/components/desktop/DesktopJobDeviceCards.jsx');
const mobileDetails = read('src/mobile791/components/JobDetailsPanel.jsx');

assert(migration.includes('create or replace function public.admin_delete_job_device'), 'Brak RPC usuwania urządzenia');
assert(migration.includes('current_user_is_admin()'), 'RPC musi być admin-only');
assert(migration.includes('delete from public.nameplate_manual_verifications'), 'RPC musi usuwać ręczne potwierdzenia');
assert(migration.includes('delete from public.photos'), 'RPC musi usuwać rekordy tabliczek urządzenia');
assert(migration.includes('set device_index = device_index - 1001'), 'RPC musi przenumerowywać potwierdzenia kolejnych urządzeń');
assert(migration.includes('update public.jobs'), 'RPC musi zaktualizować pola urządzeń w jobs');

for (const [label, source] of [['desktop', helper], ['mobile', mobileHelper]]) {
  assert(source.includes(".move(item.from, item.to)"), `${label}: tabliczki kolejnych urządzeń muszą być przenumerowane w Storage`);
  assert(source.includes("rollbackMovedStorage"), `${label}: przenoszenie Storage musi mieć rollback`);
  assert(source.includes("supabase.rpc('admin_delete_job_device'"), `${label}: helper musi wywoływać admin-only RPC`);
  assert(source.includes(".remove(targetStoragePaths)"), `${label}: pliki tabliczek usuwanego urządzenia muszą być sprzątane`);
}

for (const [label, source] of [['desktop', desktopActions], ['mobile', mobileActions]]) {
  assert(source.includes('function deleteDeviceFromJob(job, deviceIndex)'), `${label}: brak akcji deleteDeviceFromJob`);
  assert(source.includes('deleteJobDeviceRecord({'), `${label}: akcja nie korzysta z helpera`);
  assert(source.includes('deleteDeviceFromJob,'), `${label}: akcja nie jest eksportowana z hooka`);
}

assert(desktopDetails.includes('deleteDeviceFromJob={deleteDeviceFromJob}') || desktopDetails.includes('deleteDeviceFromJob,'), 'Desktop details musi przyjąć akcję usuwania');
assert(desktopCards.includes('Usuń urządzenie'), 'Desktop musi pokazywać przycisk usuwania urządzenia');
assert(mobileDetails.includes('className="jobDeviceDocumentationDeleteBtn"'), 'Mobile musi pokazywać przycisk Usuń w tabeli urządzeń');
assert(mobileDetails.includes('deleteDeviceFromJob?.(selectedJob, deviceIndex)'), 'Mobile przycisk musi usuwać właściwe urządzenie');

console.log('OK: v9.72 admin może usuwać urządzenia wraz z tabliczkami i bezpiecznym przenumerowaniem.');
