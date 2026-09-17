import { createAsyncScope } from '../../src/modules/async-scope.js';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url);
const targets=[
 ['devices','src/components/devices/DevicesPanel.jsx','loadDevices','fetchAdminDevices'],
 ['mobile-devices','src/mobile791/components/devices/DevicesPanel.jsx','loadDevices','fetchAdminDevices'],
 ['contractors','src/components/contractors/ContractorsPanel.jsx','reloadContractors','loadContractors'],
 ['mobile-contractors','src/mobile791/components/contractors/ContractorsPanel.jsx','reloadContractors','loadContractors'],
 ['fuel','src/components/fuel/FuelPanelBase.jsx','refresh','loadFuelModuleData'],
];
let failures=0;
for(const [label,path,name,fetchName] of targets){
 const src=fs.readFileSync(new URL(path,root),'utf8').replace(/\r\n/g,'\n');
 let body;
 if(name==='refresh') body=src.slice(src.indexOf('  const refresh = useCallback(async () => {'),src.indexOf('\n  useEffect(() => { void refresh();')).replace('const refresh = useCallback(async () => {','async function refresh() {').replace(/}, \[[^\]]*\]\);\s*$/, '}');
 else {const start=src.indexOf(`  async function ${name}(`); body=src.slice(start,src.indexOf('\n  useEffect(',start));}
 const pending=[];let visible;const events=[];
 const ctx={isAdmin:true,supabase:{},jobs:[],displayVehicleOverview:false,logDiagnostic(){},getFriendlyError:String,
 setLoading:x=>events.push(['loading',x]),setErrorMessage:x=>events.push(['error',x]),setError:x=>events.push(['error',x]),
 setDevices:x=>visible=x,setContractors:x=>visible=x,setVehicles:x=>visible=x,setEntries(){},setHistoryVehicleId(){},setVehicleId(){},setSourceMode(){},setInfoMessage(){},
 [fetchName]:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))};
 // The production hook supplies this guard. On baseline it is unused.
 ctx.loadGuard=createAsyncScope();
 vm.createContext(ctx);vm.runInContext(body+`;globalThis.load=${name};`,ctx);
 const result=id=>name==='loadDevices'?{devices:[{id}]}:name==='refresh'?{vehicles:[{id}],entries:[]}:[{id}];
 try {
  const old=ctx.load(),fresh=ctx.load();pending[1].resolve(result('NEW'));await fresh;pending[0].resolve(result('OLD'));await old;
  assert.equal(visible[0].id,'NEW');
  const stale=ctx.load(),current=ctx.load();pending[3].resolve(result('LATEST'));await current;const before=events.length;pending[2].reject(new Error('old error'));await stale;assert.equal(events.length,before,'stale reject must not touch error/loading');
  for(const event of ['unmount','logout','account change']){const p=ctx.load();ctx.loadGuard.close();const count=events.length;pending.at(-1).resolve(result('STALE'));await p;assert.equal(events.length,count,event);assert.equal(visible[0].id,'LATEST');ctx.loadGuard.open();}
  console.log(label,'PASS');
 } catch(e){failures++;console.error(label,'FAIL',e.message);}
}
process.exitCode=failures?1:0;


