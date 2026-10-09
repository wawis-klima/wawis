import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { getDeviceIndoorUnits, getDeviceOutdoorModel } from '../src/modules/job-devices.js';
import { deleteJobIndoorUnitRecord as desktopDelete } from '../src/modules/job-device-delete.js';
import { deleteJobIndoorUnitRecord as mobileDelete } from '../src/mobile791/modules/job-device-delete.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const migration = read('supabase/migrations/current/20261009135500_admin_delete_multi_indoor_unit_v1284.sql');
const desktopCards = read('src/components/desktop/DesktopJobDeviceCards.jsx');
const mobileDetails = read('src/mobile791/components/JobDetailsPanel.jsx');
const desktopActions = read('src/hooks/useSelectedJobActions.js');
const mobileActions = read('src/mobile791/hooks/useSelectedJobActions.js');

for (const pattern of [
  /public\.current_user_is_admin\(\)/,
  /for update;/,
  /v_indoor_count < 3/,
  /private\.remove_indoor_segment_v1284/,
  /for v_unit in reverse v_indoor_count/,
  /not \(p\.id = any\(v_moved_ids\)\)/,
  /delete from public\.photos p where p\.id = any\(v_target_ids\)/,
  /not exists \(select 1 from public\.photos p where p\.storage_path = t\.path\)/,
]) assert.match(migration, pattern);
assert.match(desktopCards, /onDeleteIndoorUnit\(deviceIndex, unit\.unitNumber/);
assert.match(desktopCards, /presentation\.indoorUnits\.length > 2/);
assert.match(mobileDetails, /deleteIndoorUnitFromJob\?\.\(selectedJob, deviceIndex, unit\.unitNumber\)/);
assert.match(mobileDetails, /indoorRows\.length > 2/);
assert.match(desktopActions, /function deleteIndoorUnitFromJob\(/);
assert.match(mobileActions, /function deleteIndoorUnitFromJob\(/);

const job = {
  id: 'demo-job',
  device_model: 'JW1: A | JW2: B | JW3: C | JW4: D | JW5: E | JZ: OUT',
  device_serial_number: 'JW1: 11 | JW2: 22 | JW3: 33 | JW4: 44 | JW5: 55 | JZ: ZZ',
};
const saved = {
  device_model: 'JW1: A | JW2: B | JW3: C | JW4: E | JZ: OUT',
  device_serial_number: 'JW1: 11 | JW2: 22 | JW3: 33 | JW4: 55 | JZ: ZZ',
  cleanup_storage_paths: ['unused-nameplate.webp'],
};
for (const [label, remove] of [['desktop', desktopDelete], ['mobile', mobileDelete]]) {
  let rpcCalls = 0;
  let storageCalls = 0;
  const supabase = {
    rpc: async (method, params) => {
      rpcCalls++;
      assert.equal(method, 'admin_delete_job_indoor_unit');
      assert.deepEqual(params, { p_job_id: 'demo-job', p_device_index: 1, p_unit_number: 4 });
      return { data: saved, error: null };
    },
    storage: {
      from: (bucket) => {
        assert.equal(bucket, 'job-photos');
        return { remove: async (paths) => {
          storageCalls++;
          assert.deepEqual(paths, ['unused-nameplate.webp']);
          return { error: null };
        } };
      },
    },
  };
  await assert.rejects(
    () => remove({ supabase, job, deviceIndex: 1, unitNumber: 4, isAdmin: false }),
    /administrator/, label,
  );
  assert.equal(rpcCalls, 0, label);
  const result = await remove({ supabase, job, deviceIndex: 1, unitNumber: 4, isAdmin: true });
  assert.equal(rpcCalls, 1, label);
  assert.equal(storageCalls, 1, label);
  assert.equal(result.deletedUnitNumber, 4, label);
  assert.equal(result.devices.length, 1, label);
  assert.deepEqual(getDeviceIndoorUnits(result.devices[0]).map(v => v.model), ['A', 'B', 'C', 'E'], label);
  assert.equal(getDeviceOutdoorModel(result.devices[0]), 'OUT', label);
}
console.log('OK: WAWIS 12.84 — individual JW RPC, admin permission, storage cleanup, unaffected JZ and JW.');
