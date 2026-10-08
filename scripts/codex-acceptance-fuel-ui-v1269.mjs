import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL('../src/components/fuel/FuelPanelBase.jsx',import.meta.url),'utf8');
const begin=src.indexOf('  async function handleAddTankDelivery(event) {');
const end=src.indexOf('\n  async function handleSubmit(event)',begin);
assert(begin>0&&end>begin,'Actual FuelPanelBase delivery handler must exist');
const handlerSource=src.slice(begin,end);
const useEffectStart=src.indexOf('  useEffect(() => {\n    if (!isAdmin || !userId) return;');
const useEffectEnd=src.indexOf('  }, [isAdmin, userId]);',useEffectStart);
assert(useEffectStart>0&&useEffectEnd>useEffectStart,'Actual reload-restoration effect must exist');
const restoreSource=src.slice(useEffectStart,useEffectEnd+'  }, [isAdmin, userId]);'.length);
const pending=new Map();
const persisted=[];
let idCount=0;
let backendWrites=0;
let attempts=0;
const userId='11111111-1111-4111-8111-111111111111';
const storage={
  getItem:key=>pending.get(key)??null,
  setItem:(key,value)=>pending.set(key,String(value)),
  removeItem:key=>pending.delete(key),
};
function makeHarness(){
 const state={errors:[],messages:[]};
 const sandbox={
   isAdmin:true,busy:false,userId,supabase:{},tankDeliveryLiters:'100',tankDeliveryNote:'test',supabase:{},
   sessionStorage:storage,
   useEffect:(callback)=>callback(),
   createFuelEntryAttemptId:()=>{idCount++;return '22222222-2222-4222-8222-'+String(idCount).padStart(12,'0');},
   normalizeFuelTankDeliveryLiters:value=>Number(value),
   setBusy:v=>{sandbox.busy=v;},setError:s=>state.errors.push(s),setMessage:s=>state.messages.push(s),
   setTankDeliveryLiters:v=>{sandbox.tankDeliveryLiters=v;},
   setTankDeliveryNote:v=>{sandbox.tankDeliveryNote=v;},
   setTankDeliveryOpen:()=>{},
   async addFuelTankDelivery({operationId,liters,note}){
     attempts++;
     persisted.push({operationId,liters,note});
     if(attempts===1){backendWrites++;throw new Error('Failed to fetch after commit');}
     assert.equal(operationId,persisted[0].operationId,'retry must use original ID');
     return {delta_liters:Number(liters)};
   },
   async refresh(){},
   logDiagnostic(){},
   console,
   JSON,Number,String,Error,
 };
 vm.runInNewContext(handlerSource+'\nthis.executeDelivery=handleAddTankDelivery;',sandbox);
 return {sandbox,state,invoke:()=>sandbox.executeDelivery({preventDefault(){}}),restore:()=>vm.runInNewContext(restoreSource,sandbox)};
}
const first=makeHarness();
await first.invoke();
const key=`wawis:fuel-delivery-attempt:v1266:${userId}`;
assert.equal(backendWrites,1,'server committed before lost response: '+JSON.stringify(first.state.errors));
assert(pending.has(key),'attempt id must persist after network timeout');
assert.equal(first.sandbox.busy,false);
const originalId=JSON.parse(pending.get(key)).operationId;
const changed=makeHarness();
changed.sandbox.tankDeliveryLiters='200';
await changed.invoke();
assert.equal(attempts,1,'changing payload cannot create a new operation with pending ID');
assert(pending.has(key));
const afterReload=makeHarness();
afterReload.restore();
assert.equal(afterReload.sandbox.tankDeliveryLiters,'100','reload must restore original liters');
assert.equal(afterReload.sandbox.tankDeliveryNote,'test');
await afterReload.invoke();
assert.equal(attempts,2,'retry must invoke exact same logical operation');
assert.equal(persisted[1].operationId,originalId);
assert.equal(idCount,1,'retry/reload must not generate another operation id');
assert.equal(backendWrites,1,'simulated original physical delivery entered once');
assert.equal(pending.has(key),false,'verified success clears pending marker');
console.log('PASS CODEX P1-03 — original FuelPanel handler: committed-lost-response, reload, mismatch, retry same ID');
