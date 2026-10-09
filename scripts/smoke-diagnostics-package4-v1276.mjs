import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
 getRefreshFeedback, settleDiagnosticSection, getPushAcceptanceMessage,
 summarizePhotoDiagnosticQueue, summarizeOfflineDiagnosticQueue, readSafeBootTrace,
} from '../src/modules/diagnostics-package4.js';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');

// Codex C7: real refreshAll contract, including ok:false without throwing and partial success.
assert.equal(getRefreshFeedback({ ok: false }).status, 'error');
assert.equal(getRefreshFeedback(undefined).status, 'error');
assert.equal(getRefreshFeedback({ ok: false, retryScheduled: true }).status, 'error');
assert.equal(getRefreshFeedback({ ok: false, ignoredStaleSession: true }).status, 'unknown');
assert.equal(getRefreshFeedback({ ok: true, partial: true }).status, 'partial');
assert.equal(getRefreshFeedback({ ok: true }).status, 'ok');
const mobile = read('src/mobile791/components/diagnostics/MobileDiagnosticsPanel.jsx');
const handler = mobile.match(/  async function handleRefresh\(\) \{[\s\S]*?\n  \}/)?.[0];
assert(handler, 'The actual mobile diagnostics handler must exist');
async function runRefresh(result) {
  const messages = [];
  const calls = [];
  const ctx = { sessionUser: { id: 'fixture-A' }, refreshAll: async () => result,
    setRefreshBusy: value => calls.push(value), setMessage: value => messages.push(value),
    getRefreshFeedback, logDiagnostic: () => {} };
  await vm.runInNewContext('(' + handler.trim() + ')', ctx)();
  assert.deepEqual(calls, [true, false]);
  return messages.at(-1);
}
assert.match(await runRefresh({ok:false}), /Nie udało/);
assert.match(await runRefresh({ok:true,partial:true}), /część danych/);
assert.match(await runRefresh({ok:true}), /Dane zostały odświeżone/);

// Central read failure is not a zero/empty list; last good values are labeled stale.
const before = { status: 'ok', value: [{id:'fixture'}], lastSuccessAt: '2026-10-08T12:00:00Z' };
const denied = settleDiagnosticSection(before, { status:'rejected', reason: new Error('42501 fixture') });
assert.equal(denied.status, 'error');
assert.equal(denied.stale, true);
assert.equal(denied.value[0].id, 'fixture');
assert.equal(denied.lastSuccessAt, before.lastSuccessAt);
assert.equal(settleDiagnosticSection(before, {status:'fulfilled',value:[]}).status, 'empty');
assert.equal(settleDiagnosticSection(before, {status:'fulfilled',value:{unavailable:true}}).status, 'error');
const desktop = read('src/components/diagnostics/DiagnosticsPanel.jsx');
const desktopHandler = desktop.match(/  async function refreshServerData\(\) \{[\s\S]*?\n  \}/)?.[0];
assert(desktopHandler, 'The actual desktop diagnostics loader must exist');
let sections = {
 recent: { status:'unknown', value:[], lastSuccessAt:'' },
 history: { status:'ok', value:[{id:1}], lastSuccessAt:'2026-10-08T12:00:00Z' },
 backup: { status:'ok', value:{total:2}, lastSuccessAt:'2026-10-08T12:00:00Z' },
 push: { status:'unknown', value:[], lastSuccessAt:'' },
};
const ctx = { profile:{role:'Administrator'}, loadSequence:{current:0}, Promise, Date,
 DIAGNOSTIC_RECENT_HOURS:24, supabase:{},
 loadRemoteDiagnosticEvents: async ({olderThanHours}) => { if(olderThanHours) throw new Error('fixture timeout'); return []; },
 loadStorageBackupOverview: async () => ({unavailable:true}),
 loadPushSubscriptionOverview: async () => [],
 settleDiagnosticSection, setRemoteSections: updater => { sections = updater(sections); } };
await vm.runInNewContext('(' + desktopHandler.trim() + ')', ctx)();
assert.equal(sections.recent.status,'empty');
assert.equal(sections.history.status,'error');
assert.equal(sections.history.value[0].id,1);
assert.equal(sections.backup.status,'error');
assert.equal(sections.backup.value.total,2);
assert.equal(sections.push.status,'empty');

// Codex C9: isolate local diagnostic summary by account and avoid exporting IDs/files/paths.
const photos = summarizePhotoDiagnosticQueue([
 {id:'not-public-A',user_id:'A',upload_status:'error',retry_count:2,upload_stage:'prepared',storage_path:'/secret/A'},
 {id:'not-public-B',user_id:'B',upload_status:'uploading',upload_stage:'storage_uploaded',storage_path:'/secret/B'},
 {id:'legacy',upload_status:'error'},
], 'A');
assert.equal(photos.total,1);
assert.equal(summarizePhotoDiagnosticQueue([{user_id:'A',upload_status:'error'}], '').total,0,'unresolved session cannot expose other accounts');
const legacyButton=read('src/mobile791/components/diagnostics/MobileDiagnosticButton.jsx');
assert.match(legacyButton,/getPhotoQueueSummary\(owner\)/,'legacy mobile report must use current account');
assert.match(legacyButton,/getPushAcceptanceMessage\(result, \{ currentDevice: true \}\)/,'legacy push test cannot promise phone delivery');
const appSource=read('src/mobile791/App.jsx');
assert.match(appSource,/getQueueSummary: \(\) => getPhotoQueueSummary\(sessionUser\?\.id \|\| ''\)/,'silent telemetry must use the current account');
assert.equal(photos.retrying,1);
assert.equal(photos.prepared,1);
assert.equal(photos.storageUploaded,0);
assert.doesNotMatch(JSON.stringify(photos), /secret|not-public|storage_path/);
const operations = summarizeOfflineDiagnosticQueue([
 {status:'conflict',user_id:'A',client:'Secret Name'}, {status:'error'}, {status:'pending'}, {status:'syncing'}
]);
assert.deepEqual(operations,{total:4,pending:1,syncing:1,conflict:1,error:1});
assert.match(mobile,/getPhotoQueueSummary\(owner\)/);
assert.match(mobile,/listOfflineJobOperations\(owner\)/);
assert.match(mobile,/offlineOperations: offlineSummary/);

// Codex C8: a pre-module observer runs even if App imports fail; never records raw errors.
const html = read('index.html');
const inline = html.match(/<script>\(function\(\)\{[\s\S]*?<\/script>/)?.[0];
assert(inline, 'Early inline bootstrap evidence must be installed before module script');
assert(html.indexOf(inline) < html.indexOf('<script type="module"'));
const events = {};
const buttons = [];
const fakeRoot = { textContent: '', appendChild: button=>buttons.push(button) };
const fakeWindow = { addEventListener:(event,fn)=>{events[event]=fn;} };
const sandbox = { window:fakeWindow, document:{ getElementById:()=>fakeRoot, createElement:()=>({}) },
 setTimeout:()=>{}, Date, Blob, URL:{createObjectURL:()=>'/blob',revokeObjectURL:()=>{}} };
vm.runInNewContext(inline.slice(8,-9), sandbox);
fakeWindow.__wawisBootTrace.mark('imports');
events.error({target:{tagName:'SCRIPT',src:'/assets/missing-file.js'}});
assert.equal(fakeWindow.__wawisBootTrace.snapshot().failed,true);
assert.equal(fakeWindow.__wawisBootTrace.snapshot().stage,'module-load-failed');
assert.equal(buttons.length,1);
globalThis.window = {__wawisBootTrace:{snapshot:()=>({
 stage:'module-load-failed',failed:true,durationMs:50,
 steps:[{stage:'imports',durationMs:5},{stage:'CLIENT SECRET',durationMs:11}],message:'Jan Testowy / Bearer secret',
})}};
const trace = readSafeBootTrace();
assert.equal(trace.stage,'module-load-failed');
assert.equal(trace.steps.length,1);
assert.doesNotMatch(JSON.stringify(trace), /secret|Jan Testowy|CLIENT SECRET|message/);
delete globalThis.window;
assert.match(read('src/main.jsx'), /__wawisBootTrace\?\.fail\?\.\('boot-failed'\)/);

// Codex C10: successful provider acceptance cannot be reported as phone display.
const pushAccepted = getPushAcceptanceMessage({delivered:1,failed:0}, {currentDevice:true});
assert.match(pushAccepted,/przyjęła/);
assert.match(pushAccepted,/nie są jeszcze potwierdzone/);
assert.doesNotMatch(pushAccepted,/Dostarczono do/);
assert.match(getPushAcceptanceMessage({delivered:0,failed:1}),/Nie potwierdzono/);
assert.match(desktop,/Subskrypcja aktywna/);
assert.doesNotMatch(desktop,/PUSH ON/);
console.log('Codex package 4 (C7-C10) runtime RED scenarios: PASS; mobile/desktop handlers, boot fallback, privacy, push labels');
