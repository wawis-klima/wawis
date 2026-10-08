import assert from 'node:assert/strict';
import {
  logDiagnostic as logDesktop, flushDiagnosticsToServer as desktopFlush,
  getDiagnosticEntries as desktopEntries, getDiagnosticSyncStatus as desktopSyncStatus,
} from '../src/modules/diagnostics.js';
import {
  logDiagnostic as logMobile, flushDiagnosticsToServer as mobileFlush,
  getDiagnosticEntries as mobileEntries, getDiagnosticSyncStatus as mobileSyncStatus,
} from '../src/mobile791/modules/diagnostics.js';
import { setDiagnosticUser, appendDiagnosticEntry, getDiagnosticSession,
  getDiagnosticDroppedCount } from '../src/modules/diagnostic-privacy.js';

function fakeStorage() {
  const values = new Map();
  return { getItem:k=>values.has(k)?values.get(k):null,
    setItem:(k,v)=>values.set(k,String(v)), removeItem:k=>values.delete(k),
    key:i=>[...values.keys()][i]??null, get length(){return values.size},
    values:()=>[...values.values()] };
}
const storage=fakeStorage();
globalThis.window={localStorage:storage,location:{pathname:'/'},screen:{width:390,height:844}};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true,language:'pl-PL',userAgent:'Node',serviceWorker:{}}});
globalThis.document={visibilityState:'visible'};
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
setDiagnosticUser(A);

// RED Codex D2: an event arriving during network await must survive ACK.
logDesktop('console.error',{args:['Failed to fetch']});
logMobile('console.warn',{args:['Load failed']});
const gate={};const waiting=new Promise(resolve=>{gate.resume=resolve});
const batches=[];
const server={from:()=>({upsert:async rows=>{batches.push(rows); await waiting; return {error:null};}})};
const pending=desktopFlush({supabase:server,userId:A});
assert.equal(batches.length,1);
assert.equal(batches[0].length,2);
logMobile('console.error',{args:['Fetch is aborted']});
const overlapping=desktopFlush({supabase:server,userId:A});
gate.resume();
const [first,shared]=await Promise.all([pending,overlapping]);
assert.equal(first.sent,2);
assert.equal(shared.sent,2);
assert.equal(batches.length,1,'concurrent flush coalesced');
let entries=desktopEntries();
assert.equal(entries.length,3,'third appended event was never overwritten');
assert.equal(entries.filter(e=>!e.remote_synced_at).length,1);
assert.equal(entries.filter(e=>e.remote_synced_at).length,2);

const later=[];
const ok={from:()=>({upsert:async rows=>{later.push(rows); return {error:null};}})};
const result=await mobileFlush({supabase:ok,userId:A});
assert.equal(result.sent,1);
assert.equal(later[0].length,1);
assert.equal(desktopEntries().filter(e=>!e.remote_synced_at).length,0);

// RED Codex D5: 300 info messages cannot erase an unsynced error.
logDesktop('console.error',{args:['Failed to fetch']});
const protectedErrorId=desktopEntries().at(-1).id;
for(let i=0;i<350;i++)logMobile('diagnostic.report.downloaded',{count:i});
entries=mobileEntries();
assert(entries.some(e=>e.id===protectedErrorId && !e.remote_synced_at),'unsynced error must survive noisy informational events');
assert(entries.length<=300,'bounded journal');
assert(getDiagnosticDroppedCount()>0,'record dropped events count');

// Oldest-first batches (not slice(-30)), with retry and deduplication.
const ids=[];
for(let i=0;i<50;i++)logDesktop('console.error',{args:['Failed to fetch']});
let expected=desktopEntries().filter(e=>!e.remote_synced_at && e.severity).map(e=>e.id);
const transport={from:()=>({upsert:async (rows,settings)=>{
  assert.equal(settings.onConflict,'user_id,client_event_id');
  assert.equal(settings.ignoreDuplicates,true);
  ids.push(rows.map(x=>x.client_event_id));
  return {error:null};
}})};
const b1=await desktopFlush({supabase:transport,userId:A});
assert.equal(b1.sent,30);
assert.deepEqual(ids[0],expected.slice(0,30),'oldest 30 must go first');
const b2=await desktopFlush({supabase:transport,userId:A});
assert.equal(b2.sent,21);
assert.deepEqual(ids[1],expected.slice(30));
assert.equal(desktopEntries().filter(e=>!e.remote_synced_at && e.severity).length,0);

// Failed RLS/transport cannot be mislabeled as "table unavailable" or ACKed.
logMobile('console.error',{args:['Failed to fetch']});
const failed={from:()=>({upsert:async()=>({error:{code:'42501',message:'new row violates row-level security policy for table app_diagnostic_events'}})})};
const err=await mobileFlush({supabase:failed,userId:A});
assert.equal(err.errorCode,'42501');
assert.equal(err.unavailable,undefined);
assert.equal(mobileSyncStatus().status,'error');
assert.equal(desktopSyncStatus().status,'ok');
assert.equal(desktopEntries().filter(e=>!e.remote_synced_at && e.severity).length,1);
const retry=await mobileFlush({supabase:ok,userId:A});
assert.equal(retry.sent,1);
assert.equal(desktopEntries().filter(e=>!e.remote_synced_at && e.severity).length,0);

// Safe v12.73 same-account envelope migrates; a foreign account never adopts it.
setDiagnosticUser('');
storage.setItem('klima_app_diagnostic_log_v1273',JSON.stringify({
 version:3,owner:B,entries:[{
  id:'diag-legacy-test',time:new Date().toISOString(),type:'console.error',
  app_version:'12.73',platform:'mobile',payload:{error:{code:'NETWORK_FETCH_FAILED'}},
 }]
}));
setDiagnosticUser(B);
assert.equal(mobileEntries().length,1,'own sanitized old envelope migrates');
const preserved=mobileEntries()[0].id;
setDiagnosticUser(A);
assert(!desktopEntries().some(e=>e.id===preserved),'cross-account old data not adopted');

// Multitab concurrent append/ACK simulated against the same shared origin storage.
const session=getDiagnosticSession();
const n=Date.now();
const one={id:'diag-multitab-one',time:new Date(n).toISOString(),type:'console.error',platform:'desktop',app_version:'12.74',payload:{code:'NETWORK_FETCH_FAILED'}};
const two={...one,id:'diag-multitab-two',time:new Date(n+1).toISOString()};
assert(appendDiagnosticEntry(one,session));
assert(appendDiagnosticEntry(two,session));
assert(desktopEntries().some(e=>e.id===one.id));
assert(desktopEntries().some(e=>e.id===two.id));

console.log('PASS Codex D2/D5/D8: race ACK, multi-tab append, oldest-first, bounded unsent retention, worker error status, retry & session isolation.');
