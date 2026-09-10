const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

(async () => {
  const devicesFetch = await import(pathToFileURL(path.join(root, 'src', 'modules', 'devices-fetch.js')).href);

  let syncCalled = false;
  let listCalled = false;
  const jobs = [
    {
      id: 'job-123',
      client: 'Michał Szota',
      city: 'Poręba',
      street: 'Jasna 5',
      phone: '600700800',
      email: 'michal@example.com',
      contractor_id: '',
      device_model: 'Rotenso Versu Caramel',
      device_serial_number: 'SN1312',
      installation_date: '2026-04-22',
    },
  ];

  const supabase = {
    async rpc(name) {
      if (name === 'admin_sync_devices_from_jobs') {
        syncCalled = true;
        return { data: { processed: 1, deleted: 0 }, error: null };
      }
      if (name === 'admin_list_devices_with_contractor') {
        listCalled = true;
        return {
          data: [
            {
              id: 'device-1',
              contractor_id: '',
              contractor_name: '',
              contractor_city: '',
              contractor_street: '',
              contractor_phone: '',
              contractor_email: '',
              model: 'Rotenso Versu Caramel',
              serial_number: 'SN1312',
              installation_date: '2026-04-22',
              service_reminder_years: 5,
              status: 'aktywne',
              notes: '',
              source_job_id: 'job-123',
              source_kind: 'job',
              created_at: '',
              updated_at: '',
            },
          ],
          error: null,
        };
      }
      throw new Error(`Nieobsługane RPC w smoke teście: ${name}`);
    },
  };

  const result = await devicesFetch.fetchAdminDevices({
    supabase,
    isAdmin: true,
    jobs,
    trySync: true,
  });

  assert.equal(syncCalled, true);
  assert.equal(listCalled, true);
  assert.equal(result.source, 'devices-rpc');
  assert.equal(result.devices.length, 1);
  assert.equal(result.devices[0].contractor_name, 'Michał Szota');
  assert.equal(result.devices[0].contractor_city, 'Poręba');
  assert.equal(result.devices[0].contractor_street, 'Jasna 5');
  assert.equal(result.devices[0].contractor_phone, '600700800');
  assert.equal(result.devices[0].contractor_email, 'michal@example.com');
  assert.equal(result.devices[0].model, 'Rotenso Versu Caramel');
  assert.equal(result.devices[0].serial_number, 'SN1312');

  const untouched = devicesFetch.mergeDeviceWithJobFallback({
    id: 'manual-1',
    contractor_name: 'Ręczny klient',
    contractor_city: 'Katowice',
    contractor_phone: '111222333',
    model: 'Model ręczny',
    serial_number: 'SN-MANUAL',
    source_kind: 'manual',
  }, jobs);

  assert.equal(untouched.contractor_name, 'Ręczny klient');
  assert.equal(untouched.contractor_city, 'Katowice');
  assert.equal(untouched.contractor_phone, '111222333');
  assert.equal(untouched.model, 'Model ręczny');
  assert.equal(untouched.serial_number, 'SN-MANUAL');

  console.log('Device job fallback smoke OK');
process.exit(0);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
