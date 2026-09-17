import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const s=fs.readFileSync(new URL('../../src/components/fuel/FuelPanelBase.jsx',import.meta.url),'utf8');
const code=s.slice(s.indexOf('const FUEL_ENTRY_ATTEMPT_STORAGE_KEY'),s.indexOf('function compactFuelHistoryDate'))+';globalThis.load=loadFuelEntryAttempt;globalThis.persist=persistFuelEntryAttempt;';
const shared=new Map();const storage=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i]??null,get length(){return map.size;}});
function tab(){const c={localStorage:storage(shared),sessionStorage:storage(new Map())};vm.createContext(c);vm.runInContext(code,c);return c;}
const t1=tab(),t2=tab();const a={ownerUserId:'A',entryId:'operation-1',fingerprint:'same',liters:'40',odometerKm:'12000'};
t1.persist(a,'A');t2.persist({...a,entryId:'operation-2'},'A');
assert.equal(t1.load('A').entryId,'operation-1','tab1 reload must retain its operation when tab2 writes identical fill');
assert.equal(t2.load('A').entryId,'operation-2');
t1.persist(null,'A','operation-1');assert.equal(t2.load('A').entryId,'operation-2');
assert.equal(t1.load('B'),null);console.log('A06 two tabs preserve distinct identical fill identities PASS');
