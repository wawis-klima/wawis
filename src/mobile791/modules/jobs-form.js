import {
  getAssignedUserIdsFromForm,
  getAssignedUserIdsFromJob,
  shouldSendAssignmentPushForInstallationDate,
} from './jobs-assignment.js';
import { applyAutoLinkedContractorToJobForm } from './job-contractors.js';
import { DEVICE_TYPE_SINGLE, ensureJobFormDevices, getJobDeviceRows, serializeJobDevicesToFields } from './job-devices.js';
import { getNameplatePhotoMetadata } from './photos.js';


export function normalizeWorkerCreateStatus(status) {
  const normalized = String(status || '').trim();
  if (normalized === 'W trakcie' || normalized === 'Zakończone') return 'W trakcie';
  return 'Nowe';
}

export const EMPTY_JOB_FORM = {
  title: '',
  client: '',
  email: '',
  phone: '',
  city: '',
  street: '',
  location: '',
  contractor_id: '',
  device_model: '',
  device_serial_number: '',
  pending_nameplate_photos: [],
  existing_nameplate_photos: [],
  devices: [{ model: '', indoor_model: '', indoor_models: [''], outdoor_model: '', serial_number: '', indoor_serial_number: '', indoor_serial_numbers: [''], outdoor_serial_number: '', legacy_serial_number: '', device_type: DEVICE_TYPE_SINGLE }],
  status: 'Nowe',
  installation_date: '',
  admin_note: '',
  worker_comment: '',
  main_technician_id: '',
  sms_consent: true,
  sms_reminder_enabled: true,
  sms_recipient_phone: '',
  viewers: [],
};


function getExistingNameplatePhotos(job = {}) {
  const newestByUnit = new Map();
  const photos = Array.isArray(job?.photos) ? job.photos : [];
  photos.forEach((photo, photoIndex) => {
    const metadata = getNameplatePhotoMetadata(photo);
    if (metadata.photo_kind !== 'nameplate' || !metadata.device_index || !metadata.unit_ref) return;
    const key = `${metadata.device_index}:${metadata.unit_ref}`;
    const createdAtTimestamp = Date.parse(photo?.created_at || '');
    const timestamp = Number.isFinite(createdAtTimestamp) ? createdAtTimestamp : photoIndex;
    const current = newestByUnit.get(key);
    if (!current || timestamp >= current.timestamp) {
      newestByUnit.set(key, {
        timestamp,
        deviceIndex: Number(metadata.device_index) - 1,
        unitRef: String(metadata.unit_ref),
        url: photo.image_url || photo.signed_url || photo.original_image_url || '',
        uploadStatus: String(photo.upload_status || ''),
      });
    }
  });
  return [...newestByUnit.values()].map(({ timestamp, ...photo }) => photo);
}

export function buildEditJobForm({ job, profiles, normalizeStatus }) {
  return ensureJobFormDevices({
    title: job.client || job.title || '',
    client: job.client || '',
    email: job.email || '',
    phone: job.sms_recipient_phone || job.phone || '',
    city: job.city || (job.location?.split(',')[0]?.trim() || ''),
    street: job.street || (job.location?.split(',').slice(1).join(',').trim() || ''),
    location: job.location || '',
    contractor_id: job.contractor_id || '',
    device_model: job.device_model || '',
    device_serial_number: job.device_serial_number || '',
    pending_nameplate_photos: [],
    existing_nameplate_photos: getExistingNameplatePhotos(job),
    devices: getJobDeviceRows(job),
    status: normalizeStatus(job.status),
    installation_date: job.installation_date || '',
    admin_note: job.admin_note || '',
    worker_comment: '',
    main_technician_id: job.main_technician_id || '',
    sms_consent: true,
    sms_reminder_enabled: true,
    sms_recipient_phone: job.sms_recipient_phone || job.phone || '',
    viewers: profiles
      .filter((person) => job.viewers.some((viewer) => viewer.user_id === person.id) && person.id !== job.main_technician_id)
      .map((person) => person.id),
  });
}



function runInBackground(task, label) {
  Promise.resolve()
    .then(task)
    .catch((error) => {
      console.error(label, error?.message || error);
    });
}

async function syncJobAccess({ supabase, editingJobId, previousViewerIds, nextViewerIds }) {
  const userIdsToRemove = previousViewerIds.filter((userId) => !nextViewerIds.includes(userId));
  const userIdsToAdd = nextViewerIds.filter((userId) => !previousViewerIds.includes(userId));

  if (userIdsToRemove.length) {
    const { error: deleteAccessError } = await supabase
      .from('job_access')
      .delete()
      .eq('job_id', editingJobId)
      .in('user_id', userIdsToRemove);
    if (deleteAccessError) throw deleteAccessError;
  }

  if (userIdsToAdd.length) {
    const { error: insertAccessError } = await supabase
      .from('job_access')
      .insert(userIdsToAdd.map((userId) => ({ job_id: editingJobId, user_id: userId })));
    if (insertAccessError) throw insertAccessError;
  }

  return { userIdsToAdd, userIdsToRemove };
}


function normalizeJobText(value) {
  return String(value || '').trim();
}

function mergeContractorSnapshotIntoForm(form = {}, contractor = {}) {
  const nextForm = { ...form };
  if (contractor?.id) nextForm.contractor_id = contractor.id;
  if (!normalizeJobText(nextForm.email) && normalizeJobText(contractor?.email)) nextForm.email = normalizeJobText(contractor.email);
  if (!normalizeJobText(nextForm.phone) && normalizeJobText(contractor?.phone)) nextForm.phone = normalizeJobText(contractor.phone);
  if (!normalizeJobText(nextForm.city) && normalizeJobText(contractor?.city)) nextForm.city = normalizeJobText(contractor.city);
  if (!normalizeJobText(nextForm.street) && normalizeJobText(contractor?.street)) nextForm.street = normalizeJobText(contractor.street);
  return nextForm;
}

async function createContractorFromJobForm({ supabase, form }) {
  if (!supabase || typeof supabase.rpc !== 'function') return null;
  const companyName = normalizeJobText(form.client);
  if (!companyName) return null;

  const { data, error } = await supabase.rpc('admin_upsert_contractor', {
    p_id: null,
    p_company_name: companyName,
    p_contact_person: null,
    p_phone: normalizeJobText(form.phone) || null,
    p_email: normalizeJobText(form.email) || null,
    p_city: normalizeJobText(form.city) || null,
    p_street: normalizeJobText(form.street) || null,
    p_notes: 'Utworzono automatycznie z nowego montażu.',
    p_nip: null,
    p_is_active: true,
  });

  if (error) throw error;
  return data || null;
}

async function createContractorFromWorkerJobForm({ supabase, form }) {
  if (!supabase || typeof supabase.rpc !== 'function') return null;
  const companyName = normalizeJobText(form.client);
  if (!companyName) return null;

  const { data, error } = await supabase.rpc('worker_create_or_get_contractor_for_job', {
    p_company_name: companyName,
    p_phone: normalizeJobText(form.phone) || null,
    p_email: normalizeJobText(form.email) || null,
    p_city: normalizeJobText(form.city) || null,
    p_street: normalizeJobText(form.street) || null,
  });

  if (error) throw error;
  return data || null;
}

async function resolveJobFormForSave({ supabase, form = {}, contractors = [], isAdmin = false }) {
  if (!isAdmin) return { ...form };

  const linked = applyAutoLinkedContractorToJobForm(form, contractors).form;
  if (normalizeJobText(linked.contractor_id)) return linked;

  const createdContractor = await createContractorFromJobForm({ supabase, form: linked });
  return createdContractor?.id ? mergeContractorSnapshotIntoForm(linked, createdContractor) : linked;
}

async function resolveNewJobFormForSave({ supabase, form = {}, contractors = [], isAdmin = false }) {
  if (isAdmin) {
    return resolveJobFormForSave({ supabase, form, contractors, isAdmin: true });
  }

  const workerForm = { ...form, contractor_id: '', main_technician_id: '', viewers: [], admin_note: '', status: normalizeWorkerCreateStatus(form.status) };
  const contractor = await createContractorFromWorkerJobForm({ supabase, form: workerForm });
  return contractor?.id ? mergeContractorSnapshotIntoForm(workerForm, contractor) : workerForm;
}

export async function addJobRecord({
  supabase,
  profile,
  form,
  contractors = [],
  isAdmin = false,
  normalizeStatus,
  createNotification,
  sendAssignmentPushFn,
}) {
  if (!supabase || !profile) return;
  if (!form.client.trim()) throw new Error('Podaj klienta.');
  if (!form.city.trim()) throw new Error('Podaj miejscowość.');
  if (!form.street.trim()) throw new Error('Podaj ulicę.');

  const resolvedForm = await resolveNewJobFormForSave({ supabase, form, contractors, isAdmin });
  const deviceFields = serializeJobDevicesToFields(resolvedForm);

  const { data, error } = await supabase.from('jobs').insert({
    title: resolvedForm.client.trim(),
    client: resolvedForm.client.trim(),
    email: resolvedForm.email.trim(),
    phone: resolvedForm.phone.trim(),
    city: resolvedForm.city.trim(),
    street: resolvedForm.street.trim(),
    location: `${resolvedForm.city.trim()}, ${resolvedForm.street.trim()}`,
    status: isAdmin ? normalizeStatus(resolvedForm.status) : normalizeWorkerCreateStatus(form.status),
    installation_date: resolvedForm.installation_date || null,
    admin_note: isAdmin ? (resolvedForm.admin_note.trim() || null) : null,
    created_by: profile.id,
    main_technician_id: isAdmin ? (resolvedForm.main_technician_id || null) : null,
    sms_consent: true,
    sms_reminder_enabled: true,
    sms_recipient_phone: resolvedForm.phone.trim() || null,
    contractor_id: resolvedForm.contractor_id || null,
    device_model: deviceFields.device_model || null,
    device_serial_number: deviceFields.device_serial_number || null,
  }).select('id, status').single();
  if (error) throw error;
  const createdJob = Array.isArray(data) ? data[0] : data;
  if (!createdJob?.id) throw new Error('Baza nie zwróciła identyfikatora zapisanego montażu.');

  const selectedUsers = [...new Set(isAdmin ? (resolvedForm.viewers || []) : [profile.id])];
  if (selectedUsers.length) {
    const { error: accessError } = await supabase.from('job_access').insert(
      selectedUsers.map((userId) => ({ job_id: createdJob.id, user_id: userId })),
    );
    if (accessError) throw accessError;

    for (const userId of selectedUsers) {
      if (userId != profile.id) {
        await createNotification({
          userId,
          title: 'Nowe',
          body: `Dodano nowe zlecenie: ${resolvedForm.client.trim()}`,
          linkJobId: createdJob.id,
        });
      }
    }
  }

  const assignedUserIds = getAssignedUserIdsFromForm(resolvedForm);
  if (isAdmin && shouldSendAssignmentPushForInstallationDate(resolvedForm.installation_date)) {
    await sendAssignmentPushFn?.({ newUserIds: assignedUserIds, jobId: createdJob.id });
  }

  return createdJob;
}

export async function saveEditedJobRecord({
  supabase,
  editingJobId,
  form,
  contractors = [],
  isAdmin = false,
  jobs,
  normalizeStatus,
  sendAssignmentPushFn,
}) {
  if (!supabase || !editingJobId) return null;
  if (!form.client.trim()) throw new Error('Podaj klienta.');
  if (!form.city.trim()) throw new Error('Podaj miejscowość.');
  if (!form.street.trim()) throw new Error('Podaj ulicę.');

  const resolvedForm = await resolveJobFormForSave({ supabase, form, contractors, isAdmin });
  const deviceFields = serializeJobDevicesToFields(resolvedForm);

  const existingJob = jobs.find((job) => job.id === editingJobId) || null;
  const previousAssignedUserIds = getAssignedUserIdsFromJob(existingJob);
  const previousViewerIds = [...new Set((existingJob?.viewers || []).map((viewer) => viewer.user_id).filter(Boolean))];
  const nextViewerIds = [...new Set((resolvedForm.viewers || []).filter(Boolean))];
  const nextAssignedUserIds = getAssignedUserIdsFromForm(resolvedForm);
  const newlyAssignedUserIds = nextAssignedUserIds.filter((userId) => !previousAssignedUserIds.includes(userId));

  const { error } = await supabase.from('jobs').update({
    title: resolvedForm.client.trim(),
    client: resolvedForm.client.trim(),
    email: resolvedForm.email.trim(),
    phone: resolvedForm.phone.trim(),
    city: resolvedForm.city.trim(),
    street: resolvedForm.street.trim(),
    location: `${resolvedForm.city.trim()}, ${resolvedForm.street.trim()}`,
    status: normalizeStatus(resolvedForm.status),
    installation_date: resolvedForm.installation_date || null,
    admin_note: resolvedForm.admin_note.trim() || null,
    main_technician_id: resolvedForm.main_technician_id || null,
    sms_consent: true,
    sms_reminder_enabled: true,
    sms_recipient_phone: resolvedForm.phone.trim() || null,
    contractor_id: resolvedForm.contractor_id || null,
    device_model: deviceFields.device_model || null,
    device_serial_number: deviceFields.device_serial_number || null,
  }).eq('id', editingJobId);
  if (error) throw error;

  await syncJobAccess({
    supabase,
    editingJobId,
    previousViewerIds,
    nextViewerIds,
  });

  if (newlyAssignedUserIds.length && shouldSendAssignmentPushForInstallationDate(resolvedForm.installation_date)) {
    runInBackground(async () => {
      await Promise.allSettled([
        sendAssignmentPushFn?.({ newUserIds: newlyAssignedUserIds, jobId: editingJobId }),
      ].filter(Boolean));
    }, 'saveEditedJobRecord background notifications failed');
  }

  return {
    jobId: editingJobId,
    newlyAssignedUserIds,
  };
}

export async function saveJobDeviceSerialsRecord({
  supabase,
  editingJobId,
  form,
}) {
  if (!supabase || !editingJobId) return null;
  const deviceFields = serializeJobDevicesToFields(form);
  const { error } = await supabase.from('jobs').update({
    device_model: deviceFields.device_model || null,
    device_serial_number: deviceFields.device_serial_number || null,
  }).eq('id', editingJobId);
  if (error) throw error;
  return { jobId: editingJobId };
}
