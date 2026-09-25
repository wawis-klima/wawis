import assert from 'node:assert/strict';
import { refreshAppData } from '../src/modules/jobs-fetch.js';

const jobId = '42be940c-ed89-4f4a-ab14-795448624cf6';
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.test' };
const profile = { id: user.id, full_name: 'Administrator', email: user.email, role: 'Administrator' };
const serverJob = {
  id: jobId,
  title: 'Piotr Wasik',
  client: 'Piotr Wasik',
  email: '',
  phone: '',
  city: 'Zawiercie',
  street: 'Puchacza 13',
  location: '',
  status: 'Nowe',
  installation_date: '2026-09-24',
  device_model: null,
  device_serial_number: null,
  admin_note: '',
  created_at: '2026-09-24T11:18:33.623Z',
  created_by: user.id,
  main_technician_id: user.id,
  contractor_id: null,
  contractor_address_id: null,
  sms_consent: false,
  sms_reminder_enabled: false,
  service_due_date: null,
  service_reminder_years: null,
  last_sms_sent_at: null,
  last_sms_status: null,
  last_sms_error: null,
  sms_recipient_phone: null,
  completed_at: null,
  completed_by: null,
};

const stalePhotos = [
  { id: 'old-jz', job_id: jobId, storage_path: `${jobId}/nameplates/device-1_jz_old.jpg`, photo_kind: 'nameplate', device_index: 1, unit_ref: 'jz', ocr_status: 'approved' },
  { id: 'old-jw', job_id: jobId, storage_path: `${jobId}/nameplates/device-1_jw-1_old.jpg`, photo_kind: 'nameplate', device_index: 1, unit_ref: 'jw-1', ocr_status: 'approved' },
];
const existingJobs = [{
  ...serverJob,
  nameplatePhotosMeta: stalePhotos,
  nameplateVerifications: [],
  nameplateVerificationTableMissing: false,
  nameplateOverviewPending: false,
  detailsLoaded: false,
  photos: [],
  comments: [],
}];

function makeQuery(table) {
  const state = { eq: [] };
  const resolve = () => {
    if (table === 'jobs') return { data: [serverJob], error: null };
    if (table === 'job_access') return { data: [], error: null };
    if (table === 'notifications') return { data: [], error: null };
    if (table === 'photos') return { data: [], error: null };
    if (table === 'nameplate_manual_verifications') return { data: [], error: null };
    if (table === 'profiles') {
      if (state.eq.some(([column, value]) => column === 'id' && value === user.id)) {
        return { data: profile, error: null };
      }
      return { data: [profile], error: null };
    }
    throw new Error(`Unexpected table ${table}`);
  };

  const query = {
    select() { return query; },
    eq(column, value) { state.eq.push([column, value]); return query; },
    order() { return Promise.resolve(resolve()); },
    maybeSingle() { return Promise.resolve(resolve()); },
    upsert() { return Promise.resolve({ data: null, error: null }); },
    then(onFulfilled, onRejected) { return Promise.resolve(resolve()).then(onFulfilled, onRejected); },
  };
  return query;
}

const supabase = {
  from(table) { return makeQuery(table); },
};

let provisionalJobs = null;
const result = await refreshAppData({
  supabase,
  user,
  existingProfile: profile,
  existingProfiles: [profile],
  existingNotifications: [],
  existingJobs,
  preserveJobDetails: true,
  onJobsReady: (jobs) => { provisionalJobs = jobs; },
});

assert.equal(provisionalJobs?.[0]?.nameplateOverviewPending, true);
assert.equal(provisionalJobs?.[0]?.nameplatePhotosMeta?.length, 2, 'cache ma być zachowany tylko podczas pobierania');

assert.equal(result.jobs[0].nameplateOverviewPending, false);
assert.deepEqual(result.jobs[0].nameplatePhotosMeta, [], 'pusta odpowiedź photos z serwera musi wyczyścić stare 2/2');
assert.deepEqual(result.jobs[0].nameplateVerifications, [], 'pusta odpowiedź ręcznych potwierdzeń musi być autorytatywna');

console.log('PASS 11.50 desktop nameplate overview authority');
