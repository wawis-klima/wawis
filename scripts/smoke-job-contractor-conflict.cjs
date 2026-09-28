const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

(async () => {
  const jobContractors = await import(pathToFileURL(path.join(root, 'src', 'modules', 'job-contractors.js')).href);
  const jobsForm = await import(pathToFileURL(path.join(root, 'src', 'modules', 'jobs-form.js')).href);

  const contractors = [
    {
      id: 'con-jan',
      company_name: 'Jan Kowalski',
      phone: '500 600 700',
      email: 'jan@example.com',
      city: 'Zawiercie',
      street: '3 Maja 1',
      contact_person: 'Jan',
      notes: 'Stały klient - nie kasować notatek.',
      nip: '6490000000',
      is_active: true,
    },
  ];

  const phoneConflict = jobContractors.findJobContractorIdentityConflict({
    contractors,
    client: 'Nieznane 1',
    phone: '500-600-700',
  });
  assert.equal(phoneConflict?.contractor?.id, 'con-jan');
  assert.deepEqual(phoneConflict.reasons, ['telefon']);
  assert.equal(jobContractors.getContractorIdentityConflictLabel(phoneConflict), 'telefon');

  const sameContractor = jobContractors.findJobContractorIdentityConflict({
    contractors,
    contractorId: 'con-jan',
    client: 'Jan Kowalski',
    phone: '500 600 700',
  });
  assert.equal(sameContractor, null, 'Wybrany kontrahent nie może konfliktować sam ze sobą');

  let rpcPayload = null;
  let concurrentPayload = null;

  const supabase = {
    async rpc(name, payload) {
      if (name === 'admin_upsert_contractor') {
        rpcPayload = payload;
        return {
          data: {
            id: payload.p_id,
            company_name: payload.p_company_name,
            phone: payload.p_phone || '',
            email: payload.p_email || '',
            city: payload.p_city || '',
            street: payload.p_street || '',
            notes: payload.p_notes || '',
            nip: payload.p_nip || '',
            is_active: payload.p_is_active !== false,
          },
          error: null,
        };
      }
      if (name === 'save_job_concurrent_v1168') {
        concurrentPayload = payload;
        return { data: { id: payload.p_id, installer_ids: payload.p_installer_ids }, error: null };
      }
      throw new Error(`Nieobsługiwane RPC w smoke teście: ${name}`);
    },
    from(table) {
      throw new Error(`Nieoczekiwany zapis tabeli w smoke teście: ${table}`);
    },
  };

  await jobsForm.saveEditedJobRecord({
    supabase,
    editingJobId: 'job-1',
    form: {
      ...jobsForm.EMPTY_JOB_FORM,
      client: 'Jan Kowalski',
      phone: '500 600 700',
      email: 'jan@example.com',
      city: 'Zawiercie',
      street: '3 Maja 1',
      viewers: [],
      contractor_duplicate_resolution: {
        action: 'overwrite',
        contractor_id: 'con-jan',
        contractor: contractors[0],
      },
    },
    contractors,
    isAdmin: true,
    baseJob: {
      id: 'job-1',
      title: 'Nieznane 1',
      client: 'Nieznane 1',
      phone: '',
      sms_recipient_phone: '',
      email: '',
      city: 'Zawiercie',
      street: '3 Maja 1',
      location: 'Zawiercie, 3 Maja 1',
      status: 'Nowe',
      installation_date: null,
      admin_note: null,
      main_technician_id: null,
      contractor_id: null,
      contractor_address_id: null,
      device_model: null,
      device_serial_number: null,
      installer_ids: [],
      viewers: [],
    },
    jobs: [],
    normalizeStatus: (status) => status || 'Nowe',
    sendAssignmentPushFn: null,
  });

  assert.ok(rpcPayload, 'Nadpisanie klienta powinno wywołać admin_upsert_contractor');
  assert.equal(rpcPayload.p_id, 'con-jan');
  assert.equal(rpcPayload.p_company_name, 'Jan Kowalski');
  assert.equal(rpcPayload.p_phone, '500 600 700');
  assert.equal(rpcPayload.p_notes, 'Stały klient - nie kasować notatek.');
  assert.equal(rpcPayload.p_nip, '6490000000');
  assert.ok(concurrentPayload, 'Montaż powinien zostać zapisany przez atomowy RPC po rozwiązaniu konfliktu');
  assert.equal(concurrentPayload.p_fields.contractor_id, 'con-jan');
  assert.equal(concurrentPayload.p_expected.contractor_id, null);
  assert.equal(Object.prototype.hasOwnProperty.call(concurrentPayload.p_fields, 'status'), false, 'Stary status nie może zostać nadpisany przy zmianie klienta.');

  console.log('Job contractor conflict decision smoke OK');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
