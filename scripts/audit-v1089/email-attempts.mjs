import assert from 'node:assert/strict';
import {getOrCreateProtocolEmailAttempt} from '../../src/mobile791/modules/job-protocol-email.js';
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const a={userId:'user-A',job:{id:'job-A'},record:{id:'protocol-A',storage_path:'A.pdf'},recipientEmail:'a@example.invalid'};
const b={userId:'user-A',job:{id:'job-B'},record:{id:'protocol-B',storage_path:'B.pdf'},recipientEmail:'b@example.invalid'};
const first=getOrCreateProtocolEmailAttempt(a);getOrCreateProtocolEmailAttempt(b);const retry=getOrCreateProtocolEmailAttempt(a);
assert.equal(first.requestKey,retry.requestKey,'A/B/A must retain logical attempt');
assert.notEqual(first.requestKey,getOrCreateProtocolEmailAttempt({...a,userId:'user-B'}).requestKey);
console.log('A04 email attempt A/B/A and owner isolation PASS');

const reloaded=await import('../../src/mobile791/modules/job-protocol-email.js?reload');
assert.equal(reloaded.getOrCreateProtocolEmailAttempt(a).requestKey,first.requestKey,'reload retains pending operation');
console.log('A04 fresh module reload PASS');
