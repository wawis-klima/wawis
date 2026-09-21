import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildNewJobFormDefaults,
  formatLocalDateForInput,
} from '../src/mobile791/modules/job-date.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hookSource = fs.readFileSync(path.join(root, 'src', 'mobile791', 'hooks', 'useJobFormModal.js'), 'utf8');

const localDate = new Date(2026, 7, 28, 23, 59, 59);
assert.equal(formatLocalDateForInput(localDate), '2026-08-28');
assert.equal(formatLocalDateForInput('nieprawidłowa-data'), '');

const emptyForm = {
  client: '',
  installation_date: '',
  viewers: ['stary-uzytkownik'],
  pending_nameplate_photos: [{ id: 'stare-zdjecie' }],
  existing_nameplate_photos: [{ id: 'stara-tabliczka' }],
  devices: [{ indoor_models: ['I35Xi'], indoor_serial_numbers: ['SN-1'] }],
};
const newForm = buildNewJobFormDefaults(emptyForm, localDate);

assert.equal(newForm.installation_date, '2026-08-28');
assert.deepEqual(newForm.viewers, []);
assert.deepEqual(newForm.pending_nameplate_photos, []);
assert.deepEqual(newForm.existing_nameplate_photos, []);
assert.notStrictEqual(newForm.devices, emptyForm.devices);
assert.notStrictEqual(newForm.devices[0].indoor_models, emptyForm.devices[0].indoor_models);
assert.equal(emptyForm.installation_date, '', 'wzorzec pustego formularza nie może zostać zmieniony');

assert.match(hookSource, /const nextForm = buildNewJobFormDefaults\(emptyJobForm\);/);
assert.match(hookSource, /jobFormInitialRef\.current = nextForm;/);
assert.match(hookSource, /setJobForm\(nextForm\);/);

console.log('OK: nowy formularz mobilny domyślnie otrzymuje lokalną datę utworzenia.');
