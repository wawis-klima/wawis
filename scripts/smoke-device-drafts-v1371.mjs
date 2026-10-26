import assert from 'node:assert/strict';
import {
  clearDeviceFormDraft, getDeviceFormDraft, saveDeviceFormDraft, setDeviceDraftOwner, takeDeviceFormDraft, toStorableDeviceDraftForm,
} from '../src/mobile791/modules/device-form-drafts.js';
import { findDuplicateDeviceSerials, describeDuplicateDeviceSerials } from '../src/mobile791/modules/device-serial-duplicates.js';
import { getDuplicateDeviceSerialMessage, DUPLICATE_DEVICE_SERIAL_MESSAGE } from '../src/mobile791/modules/database-errors.js';

// WAWIS 13.71 — test iPhone 26.10.2026.
const store = new Map();
globalThis.window = { localStorage: {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
} };

// 1. Odczyt szkicu go NIE usuwa (wejście i wyjście bez zapisu nie kasuje danych).
setDeviceDraftOwner('user-a');
const form = {
  client_name: 'Jan Kowalski', phone: '500600700',
  device_model: 'LG S12ET', device_serial_number: 'ABC123456',
  pending_nameplate_photos: [{ file: new Blob(['x']), preview: 'blob:http://x/1' }],
};
saveDeviceFormDraft('job-1', form);
assert.ok(getDeviceFormDraft('job-1'));
assert.ok(takeDeviceFormDraft('job-1'));
assert.equal(getDeviceFormDraft('job-1').fromStorage, false);

// 2. W pamięci telefonu tylko tekst urządzeń: bez danych klienta, plików i adresów blob:.
const raw = store.get('wawis-device-drafts-v1:user-a');
assert.ok(raw);
assert.doesNotMatch(raw, /Kowalski|500600700|blob:|pending_nameplate_photos/);
assert.match(raw, /ABC123456/);
assert.deepEqual(Object.keys(toStorableDeviceDraftForm(form)).sort(), ['device_model', 'device_serial_number']);

// 3. „Zamknięcie aplikacji” = utrata pamięci: zmiana konta czyści pamięć; ten sam użytkownik odzyskuje tekst.
setDeviceDraftOwner('user-b');
assert.equal(getDeviceFormDraft('job-1'), null, 'inne konto nie widzi szkicu');
setDeviceDraftOwner('user-a');
const restored = getDeviceFormDraft('job-1');
assert.equal(restored.fromStorage, true);
assert.equal(restored.form.device_serial_number, 'ABC123456');

// 4. Szkic starszy niż 14 dni wygasa; clear usuwa z obu miejsc.
const old = JSON.parse(store.get('wawis-device-drafts-v1:user-a'));
old['job-1'].savedAt = new Date(Date.now() - 15 * 86400000).toISOString();
store.set('wawis-device-drafts-v1:user-a', JSON.stringify(old));
assert.equal(getDeviceFormDraft('job-1'), null);
saveDeviceFormDraft('job-2', form);
clearDeviceFormDraft('job-2');
assert.equal(getDeviceFormDraft('job-2'), null);
assert.equal(store.has('wawis-device-drafts-v1:user-a'), false);

// 5. Brak localStorage (tryb prywatny / pełna pamięć) nie psuje aplikacji — zostaje szkic w pamięci.
globalThis.window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
assert.equal(saveDeviceFormDraft('job-3', form), true);
assert.equal(getDeviceFormDraft('job-3').fromStorage, false);

// 6. Duplikat numerów w jednym montażu wykrywany przed zapisem.
const dup = findDuplicateDeviceSerials({ device_model: 'LG A\nLG A', device_serial_number: 'JW: X1234 | JZ: Y5678\nJW: x1234 | JZ: Y5678 ' });
assert.equal(dup.length, 1);
assert.match(describeDuplicateDeviceSerials(dup), /Urządzenie 1 i urządzenie 2/);
assert.equal(findDuplicateDeviceSerials({ device_model: 'A\nB', device_serial_number: 'X1234\nY5678' }).length, 0);
assert.equal(findDuplicateDeviceSerials({ device_model: 'A\nB', device_serial_number: 'JW:  | JZ: \nJW:  | JZ: ' }).length, 0, 'puste wiersze to nie duplikat');

// 7. Komunikat błędu bazy nie każe już uruchamiać SQL — mówi o powtórzonym numerze.
const msg = getDuplicateDeviceSerialMessage({ code: '23505', message: 'duplicate key value violates unique constraint "devices_serial_number_key"', details: 'Key (lower(btrim(serial_number)))=(jw: x1234 | jz: y5678) already exists.' });
assert.match(msg, /jw: x1234 \| jz: y5678/i);
assert.match(DUPLICATE_DEVICE_SERIAL_MESSAGE, /urządzenie dodane dwa razy/);
assert.doesNotMatch(msg, /SQL|hotfix/i);

console.log('smoke-device-drafts-v1371: OK');
