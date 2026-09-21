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
  let updatePayload = null;

  const supabase = {
    async rpc(name, payload) {
      assert.equal(name, 'admin_upsert_contractor');
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
    },
    from(table) {
      if (table === 'jobs') {
        return {
          update(payload) {
            updatePayload = payload;
            return { async eq() { return { error: null }; } };
          },
        };
      }
      if (table === 'job_access') {
        return {
          delete() { return { eq() { return { async in() { return { error: null }; } }; } }; },
          async insert() { return { error: null }; },
        };
      }
      throw new Error(`Nieobsługiwana tabela w smoke teście: ${table}`);
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
    jobs: [{ id: 'job-1', viewers: [], main_technician_id: null }],
    normalizeStatus: (status) => status || 'Nowe',
    sendAssignmentPushFn: null,
  });

  assert.ok(rpcPayload, 'Nadpisanie klienta powinno wywołać admin_upsert_contractor');
  assert.equal(rpcPayload.p_id, 'con-jan');
  assert.equal(rpcPayload.p_company_name, 'Jan Kowalski');
  assert.equal(rpcPayload.p_phone, '500 600 700');
  assert.equal(rpcPayload.p_notes, 'Stały klient - nie kasować notatek.');
  assert.equal(rpcPayload.p_nip, '6490000000');
  assert.ok(updatePayload, 'Montaż powinien zostać zapisany po rozwiązaniu konfliktu');
  assert.equal(updatePayload.contractor_id, 'con-jan');

  console.log('Job contractor conflict decision smoke OK');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
