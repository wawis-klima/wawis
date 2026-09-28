import {
  getAssignedUserIdsFromForm,
  getAssignedUserIdsFromJob,
  getLegacyInstallerSuggestionIds,
  normalizeInstallerIds,
  shouldSendAssignmentPushForInstallationDate,
} from './jobs-assignment.js';
import { applyAutoLinkedContractorToJobForm } from './job-contractors.js';
import { DEVICE_TYPE_SINGLE, ensureJobFormDevices, getJobDeviceRows, serializeJobDevicesToFields } from './job-devices.js';

export const EMPTY_JOB_FORM = {
  title: '',
  client: '',
  email: '',
  phone: '',
  city: '',
  street: '',
  location: '',
  contractor_id: '',
  contractor_address_id: '',
  contractor_address_label: '',
  device_model: '',
  device_serial_number: '',
  pending_nameplate_photos: [],
  existing_nameplate_photos: [],
  devices: [{ model: '', indoor_model: '', indoor_models: [''], outdoor_model: '', serial_number: '', indoor_serial_number: '', indoor_serial_numbers: [''], outdoor_serial_number: '', legacy_serial_number: '', device_type: DEVICE_TYPE_SINGLE }],
  status: 'Nowe',
  installation_date: '',
  admin_note: '',
  main_technician_id: '',
  sms_consent: true,
  sms_reminder_enabled: true,
  sms_recipient_phone: '',
  viewers: [],
  installers_confirmed: true,
};



function getExistingNameplatePhotos(job = {}) {
  const newestByUnit = new Map();
  const photos = Array.isArray(job?.photos) ? job.photos : [];
  photos.forEach((photo, photoIndex) => {
    const storagePath = String(photo?.storage_path || '');
    const match = storagePath.match(/\/nameplates\/device-(\d+)_(jz|jw-\d+)_/i);
    const unitRef = String(photo?.unit_ref || match?.[2] || '').toLowerCase();
    const deviceIndexOneBased = Number(photo?.device_index || match?.[1] || 0);
    const photoKind = String(photo?.photo_kind || '').toLowerCase();
    if ((photoKind !== 'nameplate' && !match) || !deviceIndexOneBased || !/^(?:jz|jw-\d+)$/.test(unitRef)) return;
    const key = `${deviceIndexOneBased}:${unitRef}`;
    const createdAtTimestamp = Date.parse(photo?.created_at || '');
    const timestamp = Number.isFinite(createdAtTimestamp) ? createdAtTimestamp : photoIndex;
    const current = newestByUnit.get(key);
    if (!current || timestamp >= current.timestamp) {
      newestByUnit.set(key, {
        timestamp,
        deviceIndex: deviceIndexOneBased - 1,
        unitRef,
        url: photo.thumbnail_image_url || photo.image_url || photo.signed_url || photo.original_image_url || '',
        uploadStatus: String(photo.upload_status || 'uploaded'),
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
    contractor_address_id: job.contractor_address_id || '',
    contractor_address_label: '',
    device_model: job.device_model || '',
    device_serial_number: job.device_serial_number || '',
    pending_nameplate_photos: [],
    existing_nameplate_photos: getExistingNameplatePhotos(job),
    devices: getJobDeviceRows(job),
    status: normalizeStatus(job.status),
    installation_date: job.installation_date || '',
    admin_note: job.admin_note || '',
    main_technician_id: job.main_technician_id || '',
    sms_consent: true,
    sms_reminder_enabled: true,
    sms_recipient_phone: job.sms_recipient_phone || job.phone || '',
    viewers: (() => {
      const installerIds = Array.isArray(job.installer_ids)
        ? normalizeInstallerIds(job.installer_ids)
        : getLegacyInstallerSuggestionIds(job);
      return profiles
        .filter((person) => installerIds.includes(String(person.id)) && String(person.id) !== String(job.main_technician_id || ''))
        .map((person) => person.id);
    })(),
    installers_confirmed: Array.isArray(job.installer_ids),
  });
}



function runInBackground(task, label) {
  Promise.resolve()
    .then(task)
    .catch((error) => {
      console.error(label, error?.message || error);
    });
}

function normalizeJobText(value) {
  return String(value || '').trim();
}

const NEW_CONTRACTOR_ADDRESS_ID = '__new__';

function normalizeContractorAddressesForJob(contractor = {}) {
  const source = Array.isArray(contractor?.addresses) ? contractor.addresses : [];
  const addresses = source
    .map((address, index) => ({
      id: normalizeJobText(address?.id) || `address-${index + 1}`,
      label: normalizeJobText(address?.label) || `Adres ${index + 1}`,
      city: normalizeJobText(address?.city),
      street: normalizeJobText(address?.street),
      notes: normalizeJobText(address?.notes),
      is_primary: address?.is_primary === true,
    }))
    .filter((address) => address.city || address.street);
  if (!addresses.length && (normalizeJobText(contractor?.city) || normalizeJobText(contractor?.street))) {
    addresses.push({ id: 'address-primary', label: 'Adres główny', city: normalizeJobText(contractor.city), street: normalizeJobText(contractor.street), notes: '', is_primary: true });
  }
  if (addresses.length && !addresses.some((address) => address.is_primary)) addresses[0].is_primary = true;
  return addresses;
}

function getPrimaryContractorAddress(contractor = {}) {
  const addresses = normalizeContractorAddressesForJob(contractor);
  return addresses.find((address) => address.is_primary) || addresses[0] || null;
}

function normalizeContractorRecord(record = {}) {
  const addresses = normalizeContractorAddressesForJob(record);
  const primary = addresses.find((address) => address.is_primary) || addresses[0] || null;
  return {
    ...record,
    id: record?.id || null,
    company_name: normalizeJobText(record?.company_name),
    contact_person: normalizeJobText(record?.contact_person),
    phone: normalizeJobText(record?.phone),
    email: normalizeJobText(record?.email),
    city: primary?.city || normalizeJobText(record?.city),
    street: primary?.street || normalizeJobText(record?.street),
    addresses,
    notes: normalizeJobText(record?.notes),
    nip: normalizeJobText(record?.nip || record?.tax_id),
    is_active: record?.is_active !== false,
  };
}

function appendContractorAddress(contractor = {}, address = {}) {
  const normalized = normalizeContractorRecord(contractor);
  const city = normalizeJobText(address.city);
  const street = normalizeJobText(address.street);
  const existing = normalized.addresses.find((item) => normalizeJobText(item.city).toLocaleLowerCase('pl-PL') === city.toLocaleLowerCase('pl-PL') && normalizeJobText(item.street).toLocaleLowerCase('pl-PL') === street.toLocaleLowerCase('pl-PL'));
  if (existing) return { contractor: normalized, address: existing };
  if (!city || !street) return { contractor: normalized, address: null };
  const prepared = {
    id: normalizeJobText(address.id) || `address-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    label: normalizeJobText(address.label) || `Adres ${normalized.addresses.length + 1}`,
    city,
    street,
    notes: normalizeJobText(address.notes),
    is_primary: address.is_primary === true || !normalized.addresses.length,
  };
  const addresses = prepared.is_primary
    ? normalized.addresses.map((item) => ({ ...item, is_primary: false }))
    : normalized.addresses;
  const saved = normalizeContractorRecord({ ...normalized, addresses: [...addresses, prepared] });
  return { contractor: saved, address: saved.addresses.find((item) => item.id === prepared.id) || prepared };
}

function buildContractorPayload(contractor = {}) {
  const normalized = normalizeContractorRecord(contractor);
  const primary = getPrimaryContractorAddress(normalized);
  return {
    p_id: normalized.id || null,
    p_company_name: normalized.company_name,
    p_contact_person: normalized.contact_person || null,
    p_phone: normalized.phone || null,
    p_email: normalized.email || null,
    p_city: primary?.city || normalized.city || null,
    p_street: primary?.street || normalized.street || null,
    p_notes: normalized.notes || null,
    p_nip: normalized.nip || null,
    p_is_active: normalized.is_active,
    p_addresses: normalized.addresses,
  };
}

function mergeContractorSnapshotIntoForm(form = {}, contractor = {}) {
  const normalizedContractor = normalizeContractorRecord(contractor);
  const primaryAddress = getPrimaryContractorAddress(normalizedContractor);
  const nextForm = { ...form };
  if (normalizedContractor.id) nextForm.contractor_id = normalizedContractor.id;
  if (!normalizeJobText(nextForm.email) && normalizeJobText(normalizedContractor.email)) nextForm.email = normalizeJobText(normalizedContractor.email);
  if (!normalizeJobText(nextForm.phone) && normalizeJobText(normalizedContractor.phone)) nextForm.phone = normalizeJobText(normalizedContractor.phone);
  if (!normalizeJobText(nextForm.city) && normalizeJobText(primaryAddress?.city || normalizedContractor.city)) nextForm.city = normalizeJobText(primaryAddress?.city || normalizedContractor.city);
  if (!normalizeJobText(nextForm.street) && normalizeJobText(primaryAddress?.street || normalizedContractor.street)) nextForm.street = normalizeJobText(primaryAddress?.street || normalizedContractor.street);
  if (!normalizeJobText(nextForm.contractor_address_id) && primaryAddress?.id) nextForm.contractor_address_id = primaryAddress.id;
  return nextForm;
}

function getContractorDuplicateResolution(form = {}) {
  const resolution = form.contractor_duplicate_resolution;
  if (!resolution || typeof resolution !== 'object') return null;

  const action = normalizeJobText(resolution.action);
  const contractorId = normalizeJobText(resolution.contractor_id);
  if (!contractorId || !['link', 'overwrite'].includes(action)) return null;

  return {
    action,
    contractor_id: contractorId,
    contractor: resolution.contractor && typeof resolution.contractor === 'object' ? resolution.contractor : null,
  };
}

function stripContractorDuplicateResolution(form = {}) {
  const { contractor_duplicate_resolution: _resolution, ...rest } = form;
  return rest;
}

async function upsertContractorFromJobForm({ supabase, form, contractorId = null, existingContractor = null }) {
  if (!supabase || typeof supabase.rpc !== 'function') return null;
  const companyName = normalizeJobText(form.client);
  if (!companyName) return null;

  const isUpdate = Boolean(normalizeJobText(contractorId));
  const normalizedExisting = normalizeContractorRecord(existingContractor || {});
  let contractorForSave = {
    ...normalizedExisting,
    id: isUpdate ? normalizeJobText(contractorId) : null,
    company_name: companyName,
    phone: normalizeJobText(form.phone),
    email: normalizeJobText(form.email),
    notes: isUpdate ? normalizedExisting.notes : 'Utworzono automatycznie z nowego montażu.',
    nip: isUpdate ? normalizedExisting.nip : '',
    is_active: isUpdate ? normalizedExisting.is_active !== false : true,
  };

  const addressResult = appendContractorAddress(contractorForSave, {
    id: normalizeJobText(form.contractor_address_id) && form.contractor_address_id !== NEW_CONTRACTOR_ADDRESS_ID
      ? normalizeJobText(form.contractor_address_id)
      : null,
    label: normalizeJobText(form.contractor_address_label) || (isUpdate ? `Adres ${normalizedExisting.addresses.length + 1}` : 'Adres główny'),
    city: normalizeJobText(form.city),
    street: normalizeJobText(form.street),
    is_primary: !normalizedExisting.addresses.length,
  });
  contractorForSave = addressResult.contractor;

  const { data, error } = await supabase.rpc('admin_upsert_contractor', buildContractorPayload(contractorForSave));
  if (error) throw error;

  const saved = normalizeContractorRecord(data || contractorForSave);
  return {
    ...saved,
    selected_address_id: addressResult.address?.id || getPrimaryContractorAddress(saved)?.id || null,
  };
}

async function createContractorFromJobForm({ supabase, form }) {
  return upsertContractorFromJobForm({ supabase, form, contractorId: null, existingContractor: null });
}

async function resolveJobFormForSave({ supabase, form = {}, contractors = [], isAdmin = false }) {
  if (!isAdmin) return stripContractorDuplicateResolution({ ...form });

  const explicitResolution = getContractorDuplicateResolution(form);
  if (explicitResolution?.contractor_id) {
    const explicitForm = stripContractorDuplicateResolution({ ...form, contractor_id: explicitResolution.contractor_id });
    const catalogContractor = contractors.find((item) => String(item?.id || '') === explicitResolution.contractor_id) || null;
    if (explicitResolution.action === 'overwrite' || explicitForm.contractor_address_id === NEW_CONTRACTOR_ADDRESS_ID) {
      const updatedContractor = await upsertContractorFromJobForm({
        supabase,
        form: explicitForm,
        contractorId: explicitResolution.contractor_id,
        existingContractor: explicitResolution.contractor || catalogContractor,
      });
      return updatedContractor?.id
        ? {
            ...explicitForm,
            contractor_id: updatedContractor.id,
            contractor_address_id: updatedContractor.selected_address_id || explicitForm.contractor_address_id || null,
          }
        : explicitForm;
    }
    return explicitForm;
  }

  const linked = stripContractorDuplicateResolution(applyAutoLinkedContractorToJobForm(form, contractors).form);
  if (normalizeJobText(linked.contractor_id)) {
    if (linked.contractor_address_id === NEW_CONTRACTOR_ADDRESS_ID) {
      const linkedContractor = contractors.find((item) => String(item?.id || '') === String(linked.contractor_id)) || null;
      const updatedContractor = await upsertContractorFromJobForm({
        supabase,
        form: linked,
        contractorId: linked.contractor_id,
        existingContractor: linkedContractor,
      });
      return updatedContractor?.id
        ? { ...linked, contractor_id: updatedContractor.id, contractor_address_id: updatedContractor.selected_address_id || null }
        : { ...linked, contractor_address_id: null };
    }
    return linked;
  }

  const createdContractor = await createContractorFromJobForm({ supabase, form: linked });
  return createdContractor?.id
    ? { ...mergeContractorSnapshotIntoForm(linked, createdContractor), contractor_address_id: createdContractor.selected_address_id || getPrimaryContractorAddress(createdContractor)?.id || null }
    : linked;
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

  const resolvedForm = await resolveJobFormForSave({ supabase, form, contractors, isAdmin });
  const deviceFields = serializeJobDevicesToFields(resolvedForm);

  const { data, error } = await supabase.from('jobs').insert({
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
    created_by: profile.id,
    main_technician_id: resolvedForm.main_technician_id || null,
    sms_consent: true,
    sms_reminder_enabled: true,
    sms_recipient_phone: resolvedForm.phone.trim() || null,
    contractor_id: resolvedForm.contractor_id || null,
    contractor_address_id: resolvedForm.contractor_address_id && resolvedForm.contractor_address_id !== NEW_CONTRACTOR_ADDRESS_ID ? resolvedForm.contractor_address_id : null,
    device_model: deviceFields.device_model || null,
    device_serial_number: deviceFields.device_serial_number || null,
    installer_ids: getAssignedUserIdsFromForm(resolvedForm),
  }).select('id').single();
  if (error) throw error;
  const createdJob = Array.isArray(data) ? data[0] : data;
  if (!createdJob?.id) throw new Error('Baza nie zwróciła identyfikatora zapisanego montażu.');

  // Po potwierdzonym INSERT rekord jobs jest już utworzony. Kolejne etapy są
  // poboczne i nie mogą zamienić sukcesu INSERT w błąd całego formularza.
  const postCreateWarnings = [];
  const selectedUsers = getAssignedUserIdsFromForm(resolvedForm);
  let accessConfirmed = true;

  if (selectedUsers.length) {
    try {
      const { error: accessError } = await supabase.from('job_access').insert(
        selectedUsers.map((userId) => ({ job_id: createdJob.id, user_id: userId })),
      );
      if (accessError) throw accessError;
    } catch (accessError) {
      accessConfirmed = false;
      postCreateWarnings.push({
        phase: 'job_access',
        message: 'Nie udało się potwierdzić przypisania monterów. Otwórz zapisany montaż i ustaw przypisania ponownie.',
        error: String(accessError?.message || accessError || ''),
      });
    }

    if (accessConfirmed) {
      for (const userId of selectedUsers) {
        if (userId == profile.id) continue;
        try {
          await createNotification({
            userId,
            title: 'Nowe',
            body: `Dodano nowe zlecenie: ${resolvedForm.client.trim()}`,
            linkJobId: createdJob.id,
          });
        } catch (notificationError) {
          postCreateWarnings.push({
            phase: 'notification',
            user_id: userId,
            message: 'Nie udało się wysłać jednego z powiadomień w aplikacji.',
            error: String(notificationError?.message || notificationError || ''),
          });
        }
      }
    }
  }

  const assignedUserIds = getAssignedUserIdsFromForm(resolvedForm);
  if (accessConfirmed && shouldSendAssignmentPushForInstallationDate(resolvedForm.installation_date)) {
    try {
      await sendAssignmentPushFn?.({ newUserIds: assignedUserIds, jobId: createdJob.id });
    } catch (pushError) {
      postCreateWarnings.push({
        phase: 'push',
        message: 'Nie udało się wysłać powiadomienia PUSH o przypisaniu monterów.',
        error: String(pushError?.message || pushError || ''),
      });
    }
  }

  return {
    ...createdJob,
    access_confirmed: accessConfirmed,
    post_create_warnings: postCreateWarnings,
  };
}


function normalizeEditText(value) {
  return String(value ?? '').trim();
}

function valuesMatch(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function buildJobEditChangeSet({ form = {}, baseJob = {}, isAdmin = false, normalizeStatus }) {
  const fields = {};
  const expected = {};
  const add = (field, nextValue, baseValue) => {
    fields[field] = nextValue;
    expected[field] = baseValue ?? null;
  };

  const nextClient = normalizeEditText(form.client);
  const baseClient = normalizeEditText(baseJob.client || baseJob.title);
  if (nextClient !== baseClient) {
    add('client', nextClient, baseJob.client);
    add('title', nextClient, baseJob.title);
  }

  const nextEmail = normalizeEditText(form.email);
  if (nextEmail !== normalizeEditText(baseJob.email)) add('email', nextEmail, baseJob.email);

  const nextPhone = normalizeEditText(form.phone);
  const baseFormPhone = normalizeEditText(baseJob.sms_recipient_phone || baseJob.phone);
  if (nextPhone !== baseFormPhone) {
    add('phone', nextPhone, baseJob.phone);
    add('sms_recipient_phone', nextPhone || null, baseJob.sms_recipient_phone);
  }

  const nextCity = normalizeEditText(form.city);
  const nextStreet = normalizeEditText(form.street);
  const cityChanged = nextCity !== normalizeEditText(baseJob.city);
  const streetChanged = nextStreet !== normalizeEditText(baseJob.street);
  if (cityChanged) add('city', nextCity, baseJob.city);
  if (streetChanged) add('street', nextStreet, baseJob.street);
  if (cityChanged || streetChanged) add('location', `${nextCity}, ${nextStreet}`, baseJob.location);

  const nextStatus = normalizeStatus(form.status);
  if (nextStatus !== normalizeStatus(baseJob.status)) add('status', nextStatus, baseJob.status);

  const nextInstallationDate = normalizeEditText(form.installation_date) || null;
  const baseInstallationDate = normalizeEditText(baseJob.installation_date) || null;
  if (!valuesMatch(nextInstallationDate, baseInstallationDate)) add('installation_date', nextInstallationDate, baseJob.installation_date);

  const nextContractorId = normalizeEditText(form.contractor_id) || null;
  const baseContractorId = normalizeEditText(baseJob.contractor_id) || null;
  if (!valuesMatch(nextContractorId, baseContractorId)) add('contractor_id', nextContractorId, baseJob.contractor_id);

  if (Object.prototype.hasOwnProperty.call(form, 'contractor_address_id') || Object.prototype.hasOwnProperty.call(baseJob, 'contractor_address_id')) {
    const rawAddressId = normalizeEditText(form.contractor_address_id);
    const nextAddressId = rawAddressId && rawAddressId !== '__new__' ? rawAddressId : null;
    const baseAddressId = normalizeEditText(baseJob.contractor_address_id) || null;
    if (!valuesMatch(nextAddressId, baseAddressId)) add('contractor_address_id', nextAddressId, baseJob.contractor_address_id);
  }

  const deviceFields = serializeJobDevicesToFields(form);
  const nextDeviceModel = normalizeEditText(deviceFields.device_model) || null;
  const nextDeviceSerial = normalizeEditText(deviceFields.device_serial_number) || null;
  const baseDeviceModel = normalizeEditText(baseJob.device_model) || null;
  const baseDeviceSerial = normalizeEditText(baseJob.device_serial_number) || null;
  if (!valuesMatch(nextDeviceModel, baseDeviceModel)) add('device_model', nextDeviceModel, baseJob.device_model);
  if (!valuesMatch(nextDeviceSerial, baseDeviceSerial)) add('device_serial_number', nextDeviceSerial, baseJob.device_serial_number);

  if (isAdmin) {
    const nextAdminNote = normalizeEditText(form.admin_note) || null;
    const baseAdminNote = normalizeEditText(baseJob.admin_note) || null;
    if (!valuesMatch(nextAdminNote, baseAdminNote)) add('admin_note', nextAdminNote, baseJob.admin_note);

    const nextMainTechnician = normalizeEditText(form.main_technician_id) || null;
    const baseMainTechnician = normalizeEditText(baseJob.main_technician_id) || null;
    if (!valuesMatch(nextMainTechnician, baseMainTechnician)) add('main_technician_id', nextMainTechnician, baseJob.main_technician_id);
  }

  return { fields, expected };
}

async function saveJobConcurrentPatch({
  supabase,
  editingJobId,
  fields = {},
  expected = {},
  installerIds = null,
  expectedInstallerIds = null,
  updateInstallers = false,
}) {
  if (!supabase || !editingJobId) return null;
  if (!Object.keys(fields).length && !updateInstallers) {
    return { id: editingJobId, installer_ids: expectedInstallerIds };
  }

  const { data, error } = await supabase.rpc('save_job_concurrent_v1168', {
    p_id: editingJobId,
    p_fields: fields,
    p_expected: expected,
    p_installer_ids: updateInstallers ? installerIds : null,
    p_expected_installer_ids: updateInstallers ? expectedInstallerIds : null,
    p_update_installers: Boolean(updateInstallers),
  });
  if (error) throw error;
  return data || { id: editingJobId, installer_ids: installerIds };
}

export async function saveJobDeviceSerialsRecord({
  supabase,
  editingJobId,
  form,
  baseJob = null,
}) {
  if (!supabase || !editingJobId) return null;
  const originalJob = baseJob || {};
  const deviceFields = serializeJobDevicesToFields(form);
  const fields = {};
  const expected = {};
  const nextModel = normalizeEditText(deviceFields.device_model) || null;
  const nextSerial = normalizeEditText(deviceFields.device_serial_number) || null;
  const baseModel = normalizeEditText(originalJob.device_model) || null;
  const baseSerial = normalizeEditText(originalJob.device_serial_number) || null;

  if (!valuesMatch(nextModel, baseModel)) {
    fields.device_model = nextModel;
    expected.device_model = originalJob.device_model ?? null;
  }
  if (!valuesMatch(nextSerial, baseSerial)) {
    fields.device_serial_number = nextSerial;
    expected.device_serial_number = originalJob.device_serial_number ?? null;
  }

  const result = await saveJobConcurrentPatch({
    supabase,
    editingJobId,
    fields,
    expected,
  });
  return { ...(result || {}), jobId: editingJobId };
}

export async function saveEditedJobRecord({
  supabase,
  editingJobId,
  form,
  baseJob = null,
  contractors = [],
  isAdmin = false,
  jobs = [],
  normalizeStatus,
  sendAssignmentPushFn,
}) {
  if (!supabase || !editingJobId) return null;
  if (!form.client.trim()) throw new Error('Podaj klienta.');
  if (!form.city.trim()) throw new Error('Podaj miejscowość.');
  if (!form.street.trim()) throw new Error('Podaj ulicę.');

  const originalJob = baseJob || jobs.find((job) => String(job?.id) === String(editingJobId)) || {};
  const resolvedForm = await resolveJobFormForSave({ supabase, form, contractors, isAdmin });

  const { fields, expected } = buildJobEditChangeSet({
    form: resolvedForm,
    baseJob: originalJob,
    isAdmin,
    normalizeStatus,
  });

  const expectedInstallerIds = Array.isArray(originalJob.installer_ids)
    ? normalizeInstallerIds(originalJob.installer_ids)
    : null;
  const baselineInstallerIds = expectedInstallerIds ?? getLegacyInstallerSuggestionIds(originalJob);
  const nextInstallerIds = getAssignedUserIdsFromForm(resolvedForm);
  const installerSelectionChanged = !valuesMatch(nextInstallerIds, baselineInstallerIds);
  const updateInstallers = expectedInstallerIds !== null
    ? installerSelectionChanged
    : Boolean(resolvedForm.installers_confirmed || installerSelectionChanged);

  const previousAssignedUserIds = expectedInstallerIds ?? getAssignedUserIdsFromJob(originalJob);
  const newlyAssignedUserIds = nextInstallerIds.filter((userId) => !previousAssignedUserIds.includes(userId));

  const result = await saveJobConcurrentPatch({
    supabase,
    editingJobId,
    fields,
    expected,
    installerIds: nextInstallerIds,
    expectedInstallerIds,
    updateInstallers,
  });

  if (newlyAssignedUserIds.length && shouldSendAssignmentPushForInstallationDate(resolvedForm.installation_date)) {
    runInBackground(async () => {
      await Promise.allSettled([
        sendAssignmentPushFn?.({ newUserIds: newlyAssignedUserIds, jobId: editingJobId }),
      ].filter(Boolean));
    }, 'saveEditedJobRecord background notifications failed');
  }

  return {
    ...(result || {}),
    jobId: editingJobId,
    newlyAssignedUserIds,
    installer_ids: updateInstallers ? nextInstallerIds : expectedInstallerIds,
  };
}
