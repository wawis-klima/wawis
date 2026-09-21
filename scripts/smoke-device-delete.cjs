const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { readSql } = require('./sql-paths.cjs');

const root = path.resolve(__dirname, '..');
const panelSource = fs.readFileSync(path.join(root, 'src', 'components', 'devices', 'DevicesPanel.jsx'), 'utf8');
const devicesFetchSource = fs.readFileSync(path.join(root, 'src', 'modules', 'devices-fetch.js'), 'utf8');
const mockSource = fs.readFileSync(path.join(root, 'src', 'lib', 'mockSupabaseClient.js'), 'utf8');
const devicesSql = readSql(root, 'devices-module-stage-3-sync.sql');

assert.match(panelSource, /deleteDeviceRecord/);
assert.match(panelSource, /function openDeviceDeleteConfirm\(device\)/);
assert.match(panelSource, /async function handleConfirmDeleteDevice\(\)/);
assert.match(panelSource, /onClick=\{\(\) => openDeviceDeleteConfirm\(device\)\}/);
assert.match(panelSource, />Usuń<\/button>/);
assert.match(panelSource, /Usuwanie urządzenia/);
assert.match(panelSource, /Czy na pewno chcesz usunąć to urządzenie z katalogu\?/);
assert.match(panelSource, /Usuń urządzenie/);
assert.match(panelSource, /bez usuwania samego montażu/);

assert.match(devicesFetchSource, /export async function deleteDeviceRecord/);
assert.match(devicesFetchSource, /export async function clearFallbackJobDevice/);
assert.match(devicesFetchSource, /admin_delete_device/);
assert.match(devicesFetchSource, /patchJobDeviceRows/);
assert.match(devicesFetchSource, /device_model:\s*deviceFields\.device_model \|\| null/);
assert.match(devicesFetchSource, /device_serial_number:\s*deviceFields\.device_serial_number \|\| null/);
assert.match(mockSource, /name === 'admin_delete_device'/);
assert.match(devicesSql, /create or replace function public\.admin_delete_device\(p_id uuid\)/);

(async () => {
  const devicesFetch = await import(pathToFileURL(path.join(root, 'src', 'modules', 'devices-fetch.js')).href);

  let manualRpcCall = null;
  await devicesFetch.deleteDeviceRecord({
    isAdmin: true,
    device: { id: 'device-manual-1', source_kind: 'manual', model: 'Daikin' },
    supabase: {
      async rpc(name, payload) {
        manualRpcCall = { name, payload };
        return { data: true, error: null };
      },
    },
  });
  assert.deepEqual(manualRpcCall, { name: 'admin_delete_device', payload: { p_id: 'device-manual-1' } });

  const fallbackCalls = { updatePayload: null, jobId: null, rpcCalled: false };
  await devicesFetch.deleteDeviceRecord({
    isAdmin: true,
    device: { id: 'job-123', source_job_id: 'job-123', source_kind: 'job_fallback', model: 'Rotenso', serial_number: 'SN-1' },
    supabase: {
      from(table) {
        assert.equal(table, 'jobs');
        return {
          select() {
            return {
              eq(column, value) {
                assert.equal(column, 'id');
                assert.equal(value, 'job-123');
                return {
                  async maybeSingle() {
                    return { data: { id: 'job-123', device_model: 'Rotenso', device_serial_number: 'SN-1' }, error: null };
                  },
                };
              },
            };
          },
          update(payload) {
            fallbackCalls.updatePayload = payload;
            return {
              async eq(column, value) {
                assert.equal(column, 'id');
                fallbackCalls.jobId = value;
                return { error: null };
              },
            };
          },
        };
      },
      async rpc() {
        fallbackCalls.rpcCalled = true;
        return { data: null, error: null };
      },
    },
  });
  assert.deepEqual(fallbackCalls.updatePayload, { device_model: null, device_serial_number: null });
  assert.equal(fallbackCalls.jobId, 'job-123');
  assert.equal(fallbackCalls.rpcCalled, false);

  const linkedCalls = { updatePayload: null, jobId: null, rpcCall: null };
  await devicesFetch.deleteDeviceRecord({
    isAdmin: true,
    device: { id: 'device-linked-1', source_job_id: 'job-456', source_kind: 'job', model: 'Mitsubishi', serial_number: 'SN-2' },
    supabase: {
      from(table) {
        assert.equal(table, 'jobs');
        return {
          select() {
            return {
              eq(column, value) {
                assert.equal(column, 'id');
                assert.equal(value, 'job-456');
                return {
                  async maybeSingle() {
                    return { data: { id: 'job-456', device_model: 'Mitsubishi', device_serial_number: 'SN-2' }, error: null };
                  },
                };
              },
            };
          },
          update(payload) {
            linkedCalls.updatePayload = payload;
            return {
              async eq(column, value) {
                assert.equal(column, 'id');
                linkedCalls.jobId = value;
                return { error: null };
              },
            };
          },
        };
      },
      async rpc(name, payload) {
        linkedCalls.rpcCall = { name, payload };
        return { data: true, error: null };
      },
    },
  });
  assert.deepEqual(linkedCalls.updatePayload, { device_model: null, device_serial_number: null });
  assert.equal(linkedCalls.jobId, 'job-456');
  assert.deepEqual(linkedCalls.rpcCall, { name: 'admin_delete_device', payload: { p_id: 'device-linked-1' } });

  console.log('Device delete smoke OK');
  process.exit(0);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
