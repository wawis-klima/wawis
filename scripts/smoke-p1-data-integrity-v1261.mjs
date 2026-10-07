import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { addJobRecord } from '../src/modules/jobs-form.js';
import { calculateFuelMonthlyReport, loadFuelModuleData } from '../src/modules/fuel.js';
import { normalizePaymentConfirmation } from '../src/mobile791/modules/job-payment-confirmation.js';
import { getSingleSplitModelFamilyMismatch } from '../src/mobile791/modules/rotenso-models.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL ${name}: ${error?.message || error}`);
  }
}

await check('F03 create job is idempotent after commit-with-lost-response', async () => {
  let insertAttempt = 0;
  const committedRows = [];
  const byOperationId = new Map();

  const jobsApi = {
    insert(payload) {
      insertAttempt += 1;
      const operationId = String(payload?.create_operation_id || '');
      const existing = operationId ? byOperationId.get(operationId) : null;
      let committed = existing;
      let insertError = null;

      if (existing) {
        insertError = { code: '23505', message: 'duplicate key value violates unique constraint' };
      } else {
        committed = {
          id: `00000000-0000-4000-8000-${String(committedRows.length + 1).padStart(12, '0')}`,
          ...payload,
        };
        committedRows.push(committed);
        if (operationId) byOperationId.set(operationId, committed);
      }

      return {
        select() {
          return {
            async single() {
              if (insertAttempt === 1) {
                return { data: null, error: new TypeError('Failed to fetch after server commit') };
              }
              return insertError
                ? { data: null, error: insertError }
                : { data: { id: committed.id }, error: null };
            },
          };
        },
      };
    },
    select() {
      return {
        eq(field, value) {
          assert.equal(field, 'create_operation_id');
          return {
            async maybeSingle() {
              const row = byOperationId.get(String(value)) || null;
              return {
                data: row ? { id: row.id, create_payload_fingerprint: row.create_payload_fingerprint } : null,
                error: null,
              };
            },
          };
        },
      };
    },
  };

  const supabase = {
    from(table) {
      assert.equal(table, 'jobs');
      return jobsApi;
    },
  };

  const form = {
    client: 'Idempotencja P1',
    email: '',
    phone: '',
    nip: '',
    city: 'Zawiercie',
    street: 'Testowa 1',
    status: 'Nowe',
    installation_date: '2026-10-07',
    admin_note: '',
    main_technician_id: '',
    viewers: [],
    installers_confirmed: true,
    contractor_id: '',
    contractor_address_id: '',
    device_model: '',
    device_serial_number: '',
    devices: [],
    create_operation_id: '11111111-1111-4111-8111-111111111111',
  };

  const args = {
    supabase,
    profile: { id: '22222222-2222-4222-8222-222222222222' },
    form,
    contractors: [],
    isAdmin: false,
    normalizeStatus: (value) => value,
    createNotification: async () => {},
    sendAssignmentPushFn: async () => {},
  };

  let firstResult = null;
  try {
    firstResult = await addJobRecord(args);
  } catch {
    // Reproduce the user retry after an ambiguous network error.
  }
  const retryResult = await addJobRecord(args);

  assert.equal(committedRows.length, 1, 'Ten sam operation_id po niejednoznacznym błędzie nie może utworzyć drugiego montażu.');
  assert.equal((firstResult || retryResult)?.id, retryResult?.id);
  assert.equal(committedRows[0]?.create_operation_id, form.create_operation_id);
  assert.ok(String(committedRows[0]?.create_payload_fingerprint || '').length > 10, 'Zapis musi przechowywać fingerprint payloadu.');

  const changedForm = { ...form, street: 'Inna 99' };
  await assert.rejects(
    () => addJobRecord({ ...args, form: changedForm }),
    /konflikt|operation|idempot/i,
    'Ponowne użycie operation_id z innym payloadem musi zakończyć się jawnym konfliktem.',
  );
});

await check('F04 completion rejects missing or mismatched JW/JZ and accepts valid multi-split', async () => {
  const recognizedMismatch = getSingleSplitModelFamilyMismatch({
    outdoorModel: 'Rotenso Imoto I35Xo',
    indoorModel: 'Rotenso Ukura U35Xi',
  });
  assert.ok(recognizedMismatch, 'Istniejący słownik potrafi rozpoznać błędną parę Imoto/Ukura.');

  const modulePath = path.join(root, 'src', 'modules', 'job-device-completion-validation.js');
  assert.ok(fs.existsSync(modulePath), 'Brakuje wspólnej walidacji par JW/JZ uruchamianej przy zakończeniu.');
  const validator = await import(pathToFileURL(modulePath).href);

  const missingIndoor = validator.validateJobDevicesForCompletion({
    devices: [{
      device_type: 'single-split',
      outdoor_model: 'Rotenso Imoto I35Xo',
      outdoor_serial_number: 'OUT-1',
      indoor_models: [''],
      indoor_serial_numbers: [''],
    }],
  });
  assert.equal(missingIndoor.ok, false);
  assert.match(missingIndoor.message, /JW/i);

  const mismatch = validator.validateJobDevicesForCompletion({
    devices: [{
      device_type: 'single-split',
      outdoor_model: 'Rotenso Imoto I35Xo',
      outdoor_serial_number: 'OUT-2',
      indoor_models: ['Rotenso Ukura U35Xi'],
      indoor_serial_numbers: ['IN-2'],
    }],
  });
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.message, /niezgod|kompatybil/i);

  const multi = validator.validateJobDevicesForCompletion({
    devices: [{
      device_type: 'multi-split',
      outdoor_model: 'Rotenso Hiro Multi H50Xm2',
      outdoor_serial_number: 'OUT-M',
      indoor_models: ['Rotenso Imoto I26Xi', 'Rotenso Ukura U35Xi'],
      indoor_serial_numbers: ['IN-M1', 'IN-M2'],
    }],
  });
  assert.equal(multi.ok, true, multi.message);

  for (const relative of [
    'src/hooks/useSelectedJobActions.js',
    'src/mobile791/hooks/useSelectedJobActions.js',
  ]) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(source, /validateJobDevicesForCompletion/, `${relative} musi uruchamiać wspólną walidację bezpośrednio przed zakończeniem.`);
  }
});

await check('F05 fuel overview/report crosses the 1000-row boundary', async () => {
  const vehicle = { id: 'vehicle-1', registration_number: 'TEST1', vehicle_name: 'Test' };
  const latest = Array.from({ length: 1000 }, (_, index) => ({
    id: `new-${index}`,
    vehicle_id: vehicle.id,
    fueled_at: new Date(Date.UTC(2026, 9, 31, 20, 0, 0) - index * 60_000).toISOString(),
    liters: 10,
    odometer_km: 200000 - index,
  }));
  const oldEntry = {
    id: 'old-1001',
    vehicle_id: vehicle.id,
    fueled_at: '2025-01-15T12:00:00.000Z',
    liters: 42,
    odometer_km: 100000,
  };
  const orderedEntries = [...latest, oldEntry];

  function entriesQuery() {
    return {
      select() { return this; },
      order() { return this; },
      limit(limit) {
        return Promise.resolve({ data: orderedEntries.slice(0, limit), error: null });
      },
      range(from, to) {
        return Promise.resolve({ data: orderedEntries.slice(from, to + 1), error: null });
      },
    };
  }

  const supabase = {
    from(table) {
      if (table === 'fuel_vehicles') {
        return {
          select() { return this; },
          order() { return Promise.resolve({ data: [vehicle], error: null }); },
        };
      }
      if (table === 'fuel_entries') return entriesQuery();
      throw new Error(`Unexpected table ${table}`);
    },
  };

  const data = await loadFuelModuleData({ supabase, isAdmin: true, entryLimit: Infinity });
  const report = calculateFuelMonthlyReport({ entries: data.entries, vehicles: data.vehicles, monthKey: '2025-01' });
  assert.equal(data.entries.length, 1001, 'Widok administracyjny musi pobrać także rekord 1001+, zamiast twardo ucinać historię.');
  assert.equal(report.totals.tankings, 1, 'Starszy miesiąc nie może pokazywać 0 tylko dlatego, że rekord wypadł poza pierwsze 1000.');
  assert.equal(report.totals.fueledLiters, 42);
});

await check('F10 cash requires amount while transfer may omit it', async () => {
  assert.throws(
    () => normalizePaymentConfirmation({ enabled: true, amount: '', method: 'cash', paidDate: '2026-10-07' }),
    /gotówką.*większą od zera/i,
  );
  const transfer = normalizePaymentConfirmation({ enabled: true, amount: '', method: 'transfer', paidDate: '2026-10-07' });
  assert.equal(transfer.amount, null);

  const migration = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', 'current', '20260930071500_payment_cash_transfer_optional_amount_v1187.sql'),
    'utf8',
  );
  assert.match(migration, /payment_method\s*=\s*'cash'\s+and\s+payment_amount\s*>\s*0/i);
  assert.match(migration, /payment_method\s*=\s*'transfer'\s+and\s*\(payment_amount\s+is\s+null\s+or\s+payment_amount\s*>\s*0\)/i);
});

if (failures.length) {
  console.error('\nP1 reproducer failures:');
  failures.forEach(({ name, error }) => console.error(`- ${name}: ${error?.stack || error}`));
  process.exit(1);
}

console.log('PASS smoke-p1-data-integrity-v1261');
