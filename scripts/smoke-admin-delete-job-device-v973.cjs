const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const assignmentMigration = read('supabase/migrations/20260826190000_nameplate_photo_assignment_safe_delete_v973.sql');
const compatMigration = read('supabase/migrations/20260826190500_safe_device_delete_v973_legacy_v972_compat.sql');
const desktopHelper = read('src/modules/job-device-delete.js');
const mobileHelper = read('src/mobile791/modules/job-device-delete.js');
const desktopPhotos = read('src/modules/photos.js');
const mobilePhotos = read('src/mobile791/modules/photos.js');
const desktopFetch = read('src/modules/jobs-fetch.js');
const mobileFetch = read('src/mobile791/modules/jobs-fetch.js');

assert(assignmentMigration.includes('add column if not exists photo_kind'), 'Brak osobnego photo_kind');
assert(assignmentMigration.includes('add column if not exists device_index'), 'Brak osobnego device_index');
assert(assignmentMigration.includes('add column if not exists unit_ref'), 'Brak osobnego unit_ref');
assert(assignmentMigration.includes("'cleanup_storage_paths'"), 'RPC musi zwracać tylko pliki bezpieczne do usunięcia');
assert(assignmentMigration.includes('where not exists (select 1 from public.photos p where p.storage_path = path)'), 'Współdzielony plik nie może być usunięty, jeśli nadal jest używany');
assert(assignmentMigration.includes('device_index = case when r.old_device_index > p_device_index then r.old_device_index - 1'), 'Pozostałe tabliczki muszą być logicznie przenumerowane bez ruszania pliku');
assert(compatMigration.includes('storage.objects'), 'Backend musi zabezpieczać krótki okres zgodności ze starą v9.72');

for (const [label, source] of [['desktop', desktopHelper], ['mobile', mobileHelper]]) {
  assert(!source.includes('.move('), `${label}: v9.73 nie może przenosić plików pozostałych tabliczek`);
  assert(!source.includes('rollbackMovedStorage'), `${label}: rollback move nie powinien być już potrzebny`);
  assert(source.includes("supabase.rpc('admin_delete_job_device'"), `${label}: usunięcie musi przechodzić przez admin-only RPC`);
  assert(source.includes('rpcData?.cleanup_storage_paths'), `${label}: Storage może sprzątać tylko ścieżki zatwierdzone przez RPC`);
  assert(source.includes('.remove(cleanupStoragePaths)'), `${label}: nieużywane pliki usuniętego urządzenia powinny być sprzątane`);
}

for (const [label, source] of [['desktop', desktopPhotos], ['mobile', mobilePhotos]]) {
  assert(source.includes('const explicitDeviceIndex = Number(photo?.device_index || 0)'), `${label}: metadane z bazy muszą mieć pierwszeństwo przed nazwą pliku`);
  assert(source.includes("explicitKind === 'nameplate'"), `${label}: jawne przypisanie tabliczki musi być obsługiwane`);
}

assert(desktopPhotos.includes("photo_kind: 'nameplate'"), 'Desktop upload tabliczki musi zapisywać photo_kind');
assert(desktopPhotos.includes('device_index: deviceIndex'), 'Desktop upload tabliczki musi zapisywać device_index');
assert(desktopPhotos.includes('unit_ref: unitRef'), 'Desktop upload tabliczki musi zapisywać unit_ref');
assert(mobilePhotos.includes("photo_kind: queuedPhoto.photo_kind || ''"), 'Mobile upload musi zapisywać typ zdjęcia');
assert(mobilePhotos.includes('device_index: Number(queuedPhoto.device_index || 0)'), 'Mobile upload musi zapisywać device_index');
assert(mobilePhotos.includes("unit_ref: String(queuedPhoto.unit_ref || '').toLowerCase()"), 'Mobile upload musi zapisywać unit_ref');
assert(desktopFetch.includes('photo_kind, device_index, unit_ref'), 'Desktop fetch musi pobierać jawne przypisanie tabliczki');
assert(mobileFetch.includes('photo_kind, device_index, unit_ref'), 'Mobile fetch musi pobierać jawne przypisanie tabliczki');

console.log('OK: v9.73 usuwa urządzenie bez ruszania tabliczek pozostałych urządzeń i chroni współdzielone pliki.');
