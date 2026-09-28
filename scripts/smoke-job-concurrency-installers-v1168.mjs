import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getAssignedUserIdsFromJob,
  getLegacyInstallerSuggestionIds,
  normalizeInstallerIds,
} from '../src/modules/jobs-assignment.js';
import { buildJobEditChangeSet } from '../src/modules/jobs-form.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const normalizeStatus = (status) => status === 'Nowe zlecenie' ? 'Nowe' : (status || 'Nowe');

const explicit = {
  main_technician_id: 'tech-main',
  installer_ids: ['tech-extra', 'tech-main', 'tech-extra'],
  viewers: [{ user_id: 'creator-access-only' }, { user_id: 'tech-extra' }],
};
assert.deepEqual(getAssignedUserIdsFromJob(explicit), ['tech-extra', 'tech-main']);
assert.equal(getAssignedUserIdsFromJob(explicit).includes('creator-access-only'), false);

const legacy = {
  main_technician_id: 'tech-main',
  viewers: [{ user_id: 'creator-access-only' }, { user_id: 'tech-extra' }],
};
assert.deepEqual(getAssignedUserIdsFromJob(legacy), ['tech-main']);
assert.deepEqual(
  getLegacyInstallerSuggestionIds(legacy),
  ['creator-access-only', 'tech-extra', 'tech-main'],
);
assert.deepEqual(normalizeInstallerIds(['b', 'a', 'b', '', null]), ['a', 'b']);

const baseJob = {
  id: 'job-1',
  title: 'Klient',
  client: 'Klient',
  email: 'stary@example.com',
  phone: '600100200',
  sms_recipient_phone: '600100200',
  city: 'Zawiercie',
  street: 'Testowa 1',
  location: 'Zawiercie, Testowa 1',
  status: 'W trakcie',
  installation_date: '2026-09-28',
  contractor_id: 'contractor-1',
  contractor_address_id: 'address-1',
  device_model: 'Model A',
  device_serial_number: 'SN-A',
  admin_note: 'Bez zmian',
  main_technician_id: 'tech-main',
};

const commonForm = {
  client: 'Klient',
  email: 'stary@example.com',
  phone: '600100200',
  city: 'Zawiercie',
  street: 'Testowa 1',
  status: 'W trakcie',
  installation_date: '2026-09-28',
  contractor_id: 'contractor-1',
  contractor_address_id: 'address-1',
  devices: [{ model: 'Model A', serial_number: 'SN-A' }],
  admin_note: 'Bez zmian',
  main_technician_id: 'tech-main',
  viewers: [],
};

const phoneEdit = buildJobEditChangeSet({
  form: { ...commonForm, phone: '700800900' },
  baseJob,
  isAdmin: true,
  normalizeStatus,
});
assert.deepEqual(Object.keys(phoneEdit.fields).sort(), ['phone', 'sms_recipient_phone']);
assert.equal(phoneEdit.fields.status, undefined);
assert.equal(phoneEdit.fields.main_technician_id, undefined);
assert.equal(phoneEdit.expected.phone, '600100200');

const emailEdit = buildJobEditChangeSet({
  form: { ...commonForm, email: 'nowy@example.com' },
  baseJob,
  isAdmin: true,
  normalizeStatus,
});
assert.deepEqual(Object.keys(emailEdit.fields), ['email']);
assert.equal(emailEdit.expected.email, 'stary@example.com');

const sameFieldA = buildJobEditChangeSet({
  form: { ...commonForm, phone: '111222333' },
  baseJob,
  isAdmin: true,
  normalizeStatus,
});
const sameFieldB = buildJobEditChangeSet({
  form: { ...commonForm, phone: '444555666' },
  baseJob,
  isAdmin: true,
  normalizeStatus,
});
assert.equal(sameFieldA.expected.phone, sameFieldB.expected.phone);
assert.notEqual(sameFieldA.fields.phone, sameFieldB.fields.phone);

const migration = read('supabase', 'migrations', '20260928120000_job_installers_concurrency_v1168.sql');
assert.match(migration, /add column if not exists installer_ids uuid\[\] null/i);
assert.match(migration, /for update/i);
assert.match(migration, /JOB_EDIT_CONFLICT:%/);
assert.match(migration, /insert into public\.job_access/i);

const protocol = read('src', 'mobile791', 'modules', 'job-protocol-pdf.js');
const protocolStart = protocol.indexOf('function getAssignedTechnicians');
const protocolEnd = protocol.indexOf('export function getProtocolModelRevision', protocolStart);
const protocolInstallerFunction = protocol.slice(protocolStart, protocolEnd);
assert.match(protocolInstallerFunction, /job\?\.installer_ids/);
assert.doesNotMatch(protocolInstallerFunction, /job\?\.viewers|job\.viewers/);

const mobileForm = read('src', 'mobile791', 'components', 'modals', 'JobFormModal.jsx');
assert.match(mobileForm, /Potwierdź monterów tego montażu/);
assert.match(mobileForm, /installers_confirmed: true/);

const desktopForm = read('src', 'components', 'modals', 'JobFormModal.jsx');
assert.match(desktopForm, /Potwierdź monterów tego montażu/);

const mobileProtocolModal = read('src', 'mobile791', 'components', 'modals', 'ProtocolTestModal.jsx');
assert.match(mobileProtocolModal, /Monterzy wymagają potwierdzenia/);
assert.match(mobileProtocolModal, /!installersConfirmed/);

const desktopOcr = read('src', 'modules', 'desktop-nameplate-ocr-save.js');
assert.match(desktopOcr, /save_job_concurrent_v1168/);

console.log('11.68 concurrency + installers smoke OK');
