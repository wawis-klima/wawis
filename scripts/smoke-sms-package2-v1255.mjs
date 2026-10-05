import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadSmsHistoryPage } from '../src/modules/sms-fetch.js';
import { fetchDeviceSmsHistoryPage } from '../src/modules/devices-fetch.js';

const migration=fs.readFileSync(new URL('../supabase/migrations/20261005173500_sms_package2_history_restore_rebuild_v1255.sql',import.meta.url),'utf8');
const historyCard=fs.readFileSync(new URL('../src/components/sms/SmsHistoryCard.jsx',import.meta.url),'utf8');
const panel=fs.readFileSync(new URL('../src/components/sms/SmsPanel.jsx',import.meta.url),'utf8');
const desktopDevices=fs.readFileSync(new URL('../src/components/devices/DevicesPanel.jsx',import.meta.url),'utf8');
const mobileDevices=fs.readFileSync(new URL('../src/mobile791/components/devices/DevicesPanel.jsx',import.meta.url),'utf8');

assert.match(migration,/admin_get_sms_history_page/);
assert.match(migration,/admin_get_device_sms_history_page/);
assert.match(migration,/coalesce\(nullif\(x->>'reminder_group_primary',''\)::boolean,false\)/);
assert.doesNotMatch(migration,/jsonb_populate_recordset\(\s*null::public\.sms_log/);
assert.doesNotMatch(migration,/limit 200;/i);
assert.match(migration,/physical_delete_disabled/);
assert.match(migration,/alter function public\.guard_job_sms_runtime_columns\(\) set search_path = ''/i);

const rpcCalls=[];
const fakeSupabase={
  rpc:async(name,payload)=>{
    rpcCalls.push([name,payload]);
    return {data:{rows:[{id:'row-1'}],total:1381},error:null};
  },
};
const globalPage=await loadSmsHistoryPage({supabase:fakeSupabase,isAdmin:true,page:3,pageSize:50});
assert.equal(globalPage.total,1381);
assert.equal(globalPage.rows.length,1);
assert.deepEqual(rpcCalls[0],['admin_get_sms_history_page',{p_limit:50,p_offset:100}]);

const devicePage=await fetchDeviceSmsHistoryPage({
  supabase:fakeSupabase,isAdmin:true,page:5,pageSize:50,
  device:{id:'91000000-0000-4000-8000-000000000002',source_job_id:'91000000-0000-4000-8000-000000000001::device-1'},
});
assert.equal(devicePage.total,1381);
assert.equal(rpcCalls[1][0],'admin_get_device_sms_history_page');
assert.equal(rpcCalls[1][1].p_offset,200);
assert.equal(rpcCalls[1][1].p_source_job_id,null);

assert.match(historyCard,/Paginacja historii SMS/);
assert.match(historyCard,/currentPage - 1/);
assert.match(panel,/loadSmsHistoryPage/);
assert.match(panel,/Pokaż pełną historię/);
assert.match(desktopDevices,/fetchDeviceSmsHistoryPage/);
assert.match(mobileDevices,/fetchDeviceSmsHistoryPage/);

console.log('PASS: SMS Package 2 legacy restore, paginated history and rebuild parity wiring');
