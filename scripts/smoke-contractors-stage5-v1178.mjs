import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContractors as loadDesktopContractors } from '../src/modules/contractors-fetch.js';
import { loadContractors as loadMobileContractors } from '../src/mobile791/modules/contractors-fetch.js';
import { fetchContractorDevicesResult } from '../src/mobile791/modules/devices-fetch.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

function makeContractors(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `contractor-${String(index + 1).padStart(4, '0')}`,
    company_name: `Firma ${String(index + 1).padStart(4, '0')}`,
    contact_person: '',
    phone: '',
    email: '',
    city: '',
    street: '',
    addresses: [],
    nip: '',
    notes: '',
    is_active: true,
    created_at: '2026-09-29T00:00:00.000Z',
    updated_at: '2026-09-29T00:00:00.000Z',
  }));
}

// K21: kompletność nie zależy od 1000 rekordów ani od drugiego SELECT/range.
for (const loader of [loadDesktopContractors, loadMobileContractors]) {
  const items = makeContractors(1345);
  const calls = [];
  let fromTouched = false;
  const result = await loader({
    isAdmin: true,
    supabase: {
      async rpc(name) {
        calls.push(name);
        if (name === 'admin_get_contractors_catalog') {
          return { data: { generated_at: '2026-09-29T09:30:00Z', total: items.length, items }, error: null };
        }
        throw new Error(`unexpected rpc ${name}`);
      },
      from() {
        fromTouched = true;
        throw new Error('K21: loadContractors nie może mieszać snapshotu RPC z offsetowym SELECT-em');
      },
    },
  });
  assert.equal(result.length, 1345);
  assert.deepEqual(calls, ['admin_get_contractors_catalog']);
  assert.equal(fromTouched, false);
}

// Rollout/rollback: brak nowego RPC może jeszcze użyć starego admin_list_contractors.
{
  const result = await loadMobileContractors({
    isAdmin: true,
    supabase: {
      async rpc(name) {
        if (name === 'admin_get_contractors_catalog') {
          return { data: null, error: { message: 'function public.admin_get_contractors_catalog not found in schema cache' } };
        }
        if (name === 'admin_list_contractors') {
          return { data: makeContractors(2), error: null };
        }
        throw new Error(name);
      },
    },
  });
  assert.equal(result.length, 2);
}

// K16: mobile pobiera urządzenia z tabeli devices dla rozwiniętego klienta,
// dzięki czemu manual_import jest widoczny obok urządzenia z montażu.
{
  const jobs = [{
    id: 'job-1',
    contractor_id: 'contractor-1',
    client: 'Firma 1',
    installation_date: '2026-09-01',
    device_model: 'JOB MODEL',
    device_serial_number: 'JOB-SN',
  }];
  const manual = {
    id: 'manual-1',
    contractor_id: 'contractor-1',
    model: 'IMPORT MODEL',
    serial_number: 'IMPORT-SN',
    source_kind: 'manual_import',
    source_job_id: '',
    service_reminder_years: 5,
    status: 'aktywne',
  };
  const result = await fetchContractorDevicesResult({
    isAdmin: true,
    contractorId: 'contractor-1',
    jobs,
    supabase: {
      async rpc(name, payload) {
        assert.equal(name, 'admin_get_contractor_devices');
        assert.equal(payload.p_contractor_id, 'contractor-1');
        return { data: [manual], error: null };
      },
    },
  });
  assert.equal(result.source, 'devices-rpc');
  assert.equal(result.staleReason, '');
  assert.ok(result.devices.some((device) => device.model === 'IMPORT MODEL'), 'K16: manual_import musi być widoczny na mobile.');
  assert.ok(result.devices.some((device) => device.model === 'JOB MODEL'), 'K16: urządzenie z jobs nadal ma być widoczne.');
}

const mobilePanel = read('src', 'mobile791', 'components', 'contractors', 'ContractorsPanel.jsx');
assert.match(mobilePanel, /fetchContractorDevicesResult/);
assert.match(mobilePanel, /const expandedContractor = useMemo/);
assert.match(mobilePanel, /setContractorDevicesRemote\(\{ contractorId, rows: \[\], status: 'loading'/);
assert.match(mobilePanel, /Nie udało się odczytać pełnej listy urządzeń\. Pokazuję dane z montaży\./);
assert.match(mobilePanel, />Odśwież</);
assert.match(mobilePanel, /Ostatnie odświeżenie:/);
assert.match(mobilePanel, /Dane mogą być nieaktualne/);
assert.match(mobilePanel, /loading && !contractors\.length/);
assert.match(mobilePanel, /\{pageItems\.map\(\(contractor\) =>/);

const desktopPanel = read('src', 'components', 'contractors', 'ContractorsPanel.jsx');
assert.match(desktopPanel, /initialContractors = \[\]/);
assert.match(desktopPanel, /onContractorsLoaded = null/);
assert.match(desktopPanel, /Dane mogą być nieaktualne/);
assert.match(desktopPanel, /loading && !contractors\.length/);
assert.match(desktopPanel, /\{visibleContractors\.length \? \(/);

const desktopApp = read('src', 'App.jsx');
assert.match(desktopApp, /applyContractorsCatalogSnapshot/);
assert.match(desktopApp, /initialContractors=\{globalSearchContractors\}/);
assert.match(desktopApp, /onContractorsLoaded=\{applyContractorsCatalogSnapshot\}/);

const mobileApp = read('src', 'mobile791', 'App.jsx');
assert.match(mobileApp, /contractorsCatalogAll/);
assert.match(mobileApp, /initialContractors=\{contractorsCatalogAll\}/);
assert.match(mobileApp, /onContractorsLoaded=\{applyContractorsCatalogSnapshot\}/);

for (const sourcePath of ['src/modules/contractors-fetch.js', 'src/mobile791/modules/contractors-fetch.js']) {
  const source = read(...sourcePath.split('/'));
  assert.match(source, /admin_get_contractors_catalog/);
  assert.doesNotMatch(source, /\.range\(from, from \+ pageSize - 1\)/);
  assert.doesNotMatch(source, /firstBatch\.length === pageSize/);
}

const migration = read('supabase', 'migrations', 'current', '20260929093000_complete_contractors_catalog_v1178.sql');
assert.match(migration, /returns jsonb/i);
assert.match(migration, /jsonb_agg/i);
assert.match(migration, /order by lower\(c\.company_name\), c\.created_at desc, c\.id/i);
assert.match(migration, /current_user_is_admin\(\)/i);

console.log('11.78 contractor stage 5 (K16/K19/K21) smoke OK');
