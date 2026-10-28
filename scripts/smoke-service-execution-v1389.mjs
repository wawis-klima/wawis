import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SERVICE_VISIT_CHECKS,normalizeServiceChecklist,makeServiceProtocolSnapshot,validateServiceResult} from '../src/mobile791/modules/service-visit-checklist.js';
import {saveServiceDeviceResult,uploadServiceVisitPhoto} from '../src/mobile791/modules/service-visit-execution.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
assert.equal(SERVICE_VISIT_CHECKS.length,6);
assert.equal(Object.values(normalizeServiceChecklist(null)).filter(Boolean).length,0);
assert.equal(normalizeServiceChecklist({filtry:true,instalacja:'true'}).filtry,true);
assert.equal(normalizeServiceChecklist({filtry:true,instalacja:'true'}).instalacja,false);
assert.throws(()=>validateServiceResult({result:'usterka'},0),/zdjęcie/);
assert.doesNotThrow(()=>validateServiceResult({result:'usterka'},1));
assert.doesNotThrow(()=>validateServiceResult({result:'sprawne'},0));
const visit={id:'visit-1',scheduled_date:'2026-10-28',client:{company_name:'Jan Kowalski'},
 items:[{id:'d1',model_snapshot:'Ukura',serial_snapshot:'SER1',result:'sprawne',checklist:{filtry:true},notes:'',performed_at:'2026-10-28T10:00:00Z'},
 {id:'d2',model_snapshot:'Revio',result:null,checklist:{},notes:''}]};
const snap=makeServiceProtocolSnapshot(visit);
assert.equal(snap.items.length,2);assert.equal(snap.items[1].result,null,'Częściowa wizyta nie oznacza 2 urządzeń jako wykonanych.');
assert.equal(snap.client,'Jan Kowalski');
assert.throws(()=>makeServiceProtocolSnapshot({...visit,items:[{id:'d1',result:null,checklist:{},notes:''}]}),/przynajmniej jednego/);
const calls=[];
const supabase={rpc(name,args){calls.push({name,args});return Promise.resolve({data:true,error:null});}};
await saveServiceDeviceResult({supabase,visitId:'v',itemId:'d1',checklist:{filtry:true},result:'sprawne',notes:'OK'});
assert.equal(calls[0].name,'service_visit_admin_save_item');
assert.equal(calls[0].args.p_item_id,'d1');
await assert.rejects(()=>saveServiceDeviceResult({supabase:{rpc:async()=>({data:null,error:{message:'Brak sieci'}})},visitId:'v',itemId:'d',checklist:{},result:'sprawne'}),/Brak sieci/);
let uploaded=false,inserted=false;
const mockPhoto={
 storage:{from:()=>({upload:async (name,file)=>{assert.match(name,/\/photos\/item\//);assert.equal(file.size,4);uploaded=true;return {error:null};}})},
 from:(name)=>{assert.equal(name,'service_visit_photos');return {insert(payload){assert.equal(uploaded,true,'Najpierw Storage, dopiero metadata.');inserted=true;
  return {select:()=>({single:async()=>({data:{id:'photo-1',...payload},error:null})})};}};}
};
const photo=await uploadServiceVisitPhoto({supabase:mockPhoto,visitId:'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',itemId:'item',
 file:{type:'image/jpeg',size:4}});
assert.equal(photo.id,'photo-1');assert.ok(inserted);
await assert.rejects(()=>uploadServiceVisitPhoto({supabase:mockPhoto,visitId:'v',itemId:'d',file:{type:'image/heic',size:4}}),/JPEG/);
const migration=read('supabase/migrations/20261028220000_service_visit_execution_v1389.sql');
const ui=read('src/mobile791/components/devices/ServiceExecutionPanel.jsx');
const panel=read('src/mobile791/components/devices/ServiceAdminPanel.jsx');
assert.match(migration,/on storage\.objects for select to authenticated/);
assert.match(migration,/public\.current_user_is_admin\(\)/);
assert.match(migration,/p_pdf_path/);
assert.match(migration,/storage\.objects/);
assert.match(migration,/p\.file_size_bytes>0/);
assert.match(migration,/p_snapshot->'items'/);
assert.match(migration,/potwierdź wszystkie sześć czynności kontrolnych/);
assert.match(migration,/Nie wszystkie obowiązkowe kontrole urządzeń zostały potwierdzone/);
assert.match(ui,/mandatoryChecksDone/);
assert.match(migration,/performed_by=case when p_result is not null then auth.uid\(\)/);
assert.match(migration,/status='wykonany'/);
assert.match(migration,/revoke update, delete on public\.service_visits/);
assert.match(ui,/canvas[\\s\\S]*?onPointerDown/);
assert.match(ui,/Zakończ przegląd i zapisz PDF/);
assert.match(ui,/service_visit_admin_wait_for_signature/);
assert.match(ui,/if\(signed\) clearSignature\(\)/, 'Changing checks must invalidate existing client signature.');
assert.match(ui,/if\(signed\)clearSignature\(\)/, 'Adding issue evidence must invalidate existing client signature.');
assert.match(ui,/oczekuje na podpis klienta/);
assert.match(migration,/service_visit_admin_wait_for_signature/);
assert.match(ui,/!signed\|\|doneCount===0\|\|unsaved/);
assert.match(panel,/ServiceExecutionPanel/);
assert.match(panel,/activeModule|Wykonaj przegląd/);
console.log('WAWIS 13.89 service execution regression: PASS');
