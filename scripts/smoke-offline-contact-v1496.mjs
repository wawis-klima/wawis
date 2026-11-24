// WAWIS 14.96 (decyzja właściciela 24.11.2026): dane kontaktowe klienta zapisywane bez internetu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const form = read('src/mobile791/modules/jobs-form.js');
const store = read('src/mobile791/modules/job-offline-store.js');
const sync = read('src/mobile791/modules/job-offline-sync.js');
const actions = read('src/mobile791/hooks/useSelectedJobActions.js');
const status = read('src/mobile791/components/PhotoSyncStatus.jsx');

// Tylko pola kontaktowe — urządzenia, status, data, kontrahent, NIP, zdjęcia i monterzy nadal wymagają internetu.
assert.match(form, /OFFLINE_CONTACT_FIELDS = Object\.freeze\(\['client', 'title', 'email', 'phone', 'sms_recipient_phone', 'city', 'street', 'location'\]\)/);
for (const blocked of ["'nip'", "'photos'", "'qr_stickers'", "'installer_ids'"]) assert.ok(form.includes(`blocked.push(${blocked})`), `blokada ${blocked}`);
// Wysyłka tą samą funkcją serwera co edycja online (kontrola konfliktu).
assert.match(form, /export async function saveJobContactPatch[\s\S]*?saveJobConcurrentPatch\(/);
assert.match(sync, /if \(operation\.type === 'contact'\) return syncContactOperation\(options\);/);
assert.match(sync, /JOB_EDIT_CONFLICT:[\s\S]*?OfflineConflictError/);
// Łączenie kolejnych zmian: najstarsza wartość bazowa zostaje.
assert.match(store, /record\.type === 'contact' && superseded\.length/);
assert.match(store, /operation\.type === 'contact'\) \{\n\s*nextJob = \{ \.\.\.nextJob, \.\.\.\(operation\.payload\?\.fields \|\| \{\}\) \};/);
// „Zapisano na telefonie” dopiero po odczycie wpisu z pamięci telefonu.
assert.match(actions, /listOfflineJobOperations\(profile\.id\)\)\.some\(/);
assert.match(actions, /Brak internetu — dane klienta zapisano na telefonie/);
assert.match(actions, /Słaby internet — dane klienta zapisano na telefonie/);
assert.match(actions, /Słaby internet — zapisu nie udało się potwierdzić/);
// 14.97: kreator urządzeń — sam tekst do kolejki, inaczej dotychczasowy błąd.
assert.match(actions, /throw new Error\('Zapisywanie danych urządzenia trwa zbyt długo/);
assert.match(status, /item\.type === 'contact'\) return 'Dane kontaktowe klienta'/);
console.log('smoke-offline-contact-v1496: OK');
