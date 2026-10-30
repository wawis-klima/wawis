import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {SERVICE_VISIT_CHECKS,normalizeServiceChecklist,makeServiceProtocolSnapshot,validateServiceResult} from '../src/mobile791/modules/service-visit-checklist.js';
import {saveServiceDeviceResult,uploadServiceVisitPhoto} from '../src/mobile791/modules/service-visit-execution.js';
import { serviceTechnicianInitials } from '../src/mobile791/modules/service-visit-initials.js';
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
await assert.rejects(()=>saveServiceDeviceResult({supabase:{rpc:async()=>({data:null,error:{message:'Brak sieci'}})},visitId:'v',itemId:'d',checklist:{},result:'sprawne'}),{message:/Brak sieci/});
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
assert.match(ui,/canvas[\s\S]*?onPointerDown/);
assert.match(ui,/Zakończ przegląd i zapisz PDF/);
assert.match(ui,/service_visit_admin_wait_for_signature/);
assert.match(ui,/if\(signatureDataUrl\)setSignatureDataUrl\(''\)/, 'Editing results and photos invalidates accepted signature.');
assert.match(ui,/function confirmSignature\(\)/, 'Signature confirmation is separate from protocol finalization.');
assert.match(ui,/AppModal open=\{signatureOpen\}/, 'Signature uses the same full-screen modal as montage.');
assert.match(ui,/protocolSignatureModal/, 'Reuse existing production signature presentation.');
assert.match(ui,/Zrób podpis/, 'Button opens the signature modal.');
assert.match(ui,/Zatwierdź podpis/, 'Signature is confirmed before finalization.');
assert.match(ui,/oczekuje na podpis klienta/);
assert.match(migration,/service_visit_admin_wait_for_signature/);
assert.match(ui,/!signatureDataUrl\|\|doneCount===0\|\|unsaved/);
assert.equal(serviceTechnicianInitials(['Piotr Wasik']), 'PW');
assert.equal(serviceTechnicianInitials(['Paweł Makieła','Piotr Wasik']), 'PM, PW');
assert.equal(serviceTechnicianInitials([]), '—');
assert.match(panel,/ServiceExecutionPanel/);
assert.match(panel,/activeModule|Wykonaj przegląd/);
console.log('WAWIS 13.89 service execution regression: PASS');

const assignmentSql=read('supabase/migrations/20261029103000_service_visit_assignment_push_v1393.sql');
const assignmentEdge=read('supabase/functions/send-service-visit-assignment-push/index.ts');
const pdf=read('src/mobile791/modules/service-visit-pdf.js');
assert.match(pdf,/serviceTechnicianInitials\(technicianNames\)/, 'Only initials are visible in the PDF.');
assert.match(assignmentSql,/after insert on public\.service_visit_assignment_events/);
assert.match(assignmentSql,/not \(u\.id=any\(old_ids\)\)/,'Push is only sent for new assignees.');
assert.match(assignmentSql,/processed_at is null/,'Retry queue is durable.');
assert.match(assignmentSql,/coalesce\(auth\.role\(\),''\)<>\'service_role\'/,'RPC restricted to service role.');
assert.match(assignmentEdge,/get_service_visit_assignment_push_event_v1393/);
assert.match(assignmentEdge,/service_visit_assignment_webhook/);
assert.match(assignmentEdge,/sendPushToUsers/);
assert.match(assignmentEdge,/stillAssigned/);

const trashSql=read('supabase/migrations/20261029112500_service_visit_admin_trash_v1394.sql');
const serviceModule=read('src/mobile791/modules/service-visits.js');
const signatureModule=await import('../src/mobile791/modules/service-visit-signature.js');
assert.match(trashSql,/public.current_user_is_admin\(\)/,'Only administrator can archive/restore');
assert.match(trashSql,/revoke all on function public.service_visit_admin_trash/,'Trash RPC is deny-by-default');
assert.match(trashSql,/deleted_at=now\(\)/);
assert.match(trashSql,/deleted_at=null/,'Restore is non-destructive');
assert.doesNotMatch(trashSql,/delete from public\.service_visits|delete from storage\.objects/i);
assert.match(serviceModule,/request = trashed \? request\.not\('deleted_at','is',null\)/);
assert.match(panel,/onClick=\{trashVisit\}/);
assert.match(panel,/onClick=\{restoreVisit\}/);
assert.match(ui,/captureServiceSignature\(canvasRef.current\)/);
const img=new Uint8ClampedArray(80*40*4).fill(255);
for(let y=8;y<=23;y++)for(let x=12;x<=60;x++){
 const off=(y*80+x)*4;img[off]=25;img[off+1]=35;img[off+2]=55;
}
assert.deepEqual(signatureModule.getSignatureInkBounds(img,80,40),{left:12,top:8,right:60,bottom:23});
assert.equal(signatureModule.getSignatureInkBounds(new Uint8ClampedArray(80*40*4).fill(255),80,40),null);
const pushHealth=read('src/mobile791/modules/service-visit-push-health.js');
assert.match(pushHealth,/getPushStatus/,'Push context uses existing WAWIS lifecycle API');
assert.match(pushHealth,/readPushServiceWorkerContext/);
console.log('WAWIS 13.94 trash, signature, push health regression: PASS');

const permanentSql=read('supabase/migrations/20261029132500_service_visit_permanent_purge_v1395.sql');
const permanentEdge=read('supabase/functions/purge-service-visit/index.ts');
const permanentConfig=read('supabase/config.toml');
const adminService=read('src/mobile791/components/devices/ServiceAdminPanel.jsx');
const adminServiceApi=read('src/mobile791/modules/service-visits.js');
assert.match(permanentSql,/service_visit_purge_prepare_v1395/);
assert.match(permanentSql,/service_visit_purge_finalize_v1395/);
assert.match(permanentSql,/role='Administrator'/,'Backend verifies administrator profile');
assert.match(permanentSql,/service_role_only/,'RPCs reject non-service callers');
assert.match(permanentSql,/v_visit.deleted_at is null/,'Only visits already in trash may be purged');
assert.match(permanentSql,/bucket_id='service-visit-files'/);
assert.match(permanentSql,/name like \(p_visit_id::text \|\| '\/%'\)/,'Files strictly scoped to visit UUID prefix');
assert.match(permanentSql,/if exists\([\s\S]*?storage.objects[\s\S]*?\) then raise exception/,'Never erase database rows if files remain');
assert.match(permanentSql,/delete from public\.service_visit_protocol_email_log where service_visit_id=p_visit_id/);
assert.match(permanentSql,/delete from public\.service_visit_photos where service_visit_device_id in/);
assert.match(permanentSql,/delete from public\.service_visits where id=p_visit_id/);
assert.doesNotMatch(permanentSql,/delete from storage\.objects|delete from public\.devices|delete from public\.contractors|delete from public\.jobs/i);
assert.match(permanentEdge,/session\.auth\.getUser\(\)/,'Edge authenticates JWT with auth server');
assert.match(permanentEdge,/profile\?\.role!=="Administrator"/);
assert.match(permanentEdge,/body\.confirmation!=="PERMANENT_DELETE"/);
assert.match(permanentEdge,/p\.startsWith\(prefix\)/,'Cross-visit files cannot be deleted');
assert.match(permanentEdge,/admin\.storage\.from\("service-visit-files"\)\.remove\(batch\)/,'Storage API removes actual objects');
assert.match(permanentEdge,/remaining\.length!==0/,'Storage empty verification before database delete');
assert.match(permanentEdge,/service_visit_purge_finalize_v1395/);
assert.match(permanentConfig,/\[functions\.purge-service-visit\]\s+verify_jwt = true/);
const purgeSource=adminService.match(/  async function purgeVisit\(\) \{[\s\S]*?\n  \}\n  function startPlan\(\)/)?.[0].replace(/\n  function startPlan\(\)$/, '');
assert.ok(purgeSource,'Real purge handler is present');
assert.doesNotMatch(purgeSource,/window\.prompt|USUN/,'Never require typed confirmation');
assert.equal((purgeSource.match(/window\.confirm\(/g)||[]).length,1,'Exactly one confirmation');
async function exercisePurge({confirmAnswer,deletedAt='2026-10-29T13:00:00Z',fail=false}) {
  const confirmations=[],calls=[],state=[];
  const scope={
    busy:false,
    currentVisit:{id:'visit-fixture',deleted_at:deletedAt,client:{company_name:'Klient testowy'},scheduled_date:'2026-10-29'},
    window:{confirm(message){confirmations.push(message);return confirmAnswer;},prompt(){throw Error('Typed confirmation forbidden');}},
    formatServiceDate: value=>value,
    supabase:{},
    purgeAdminServiceVisit:async({visitId})=>{calls.push(visitId);if(fail)throw Error('Backend niedostępny');},
    loadAdminServiceVisits:async({trashed})=>{assert.equal(trashed,true);return [];},
    setBusy:value=>state.push(['busy',value]),
    setError:value=>state.push(['error',value]),
    setMessage:value=>state.push(['message',value]),
    setCurrentVisit:value=>state.push(['visit',value]),
    setVisits:value=>state.push(['visits',value]),
    setScreen:value=>state.push(['screen',value]),
    friendlyError:err=>err.message,
  };
  await vm.runInNewContext(purgeSource+'; purgeVisit()',scope);
  return {confirmations,calls,state};
}
const refused=await exercisePurge({confirmAnswer:false});
assert.equal(refused.confirmations.length,1,'Cancel still shows just one question');
assert.deepEqual(refused.calls,[],'Cancel must never invoke destructive backend');
assert.deepEqual(refused.state,[],'Cancel must leave UI state untouched');
const accepted=await exercisePurge({confirmAnswer:true});
assert.equal(accepted.confirmations.length,1,'Confirm must not show second question');
assert.match(accepted.confirmations[0],/Czy na pewno chcesz trwale usunąć ten serwis\?/);
assert.match(accepted.confirmations[0],/Klient testowy/);
assert.deepEqual(accepted.calls,['visit-fixture'],'Confirmed action invokes backend exactly once');
assert.equal(accepted.state.find(([key])=>key==='screen')?.[1],'trash','Returns to trash after deletion');
assert.equal(accepted.state.at(-1)?.[1],false,'Busy cleared after successful deletion');
const active=await exercisePurge({confirmAnswer:true,deletedAt:null});
assert.deepEqual(active.confirmations,[],'Not-trashed service is not eligible');
assert.deepEqual(active.calls,[],'Not-trashed service cannot be purged');
const failed=await exercisePurge({confirmAnswer:true,fail:true});
assert.equal(failed.calls.length,1,'Failed backend is not retried without user action');
assert.ok(failed.state.some(([key,value])=>key==='error'&&value==='Backend niedostępny'));
assert.equal(failed.state.at(-1)?.[1],false,'Busy cleared on failure');
assert.match(adminService,/onClick=\{purgeVisit\}/);
assert.match(adminServiceApi,/supabase\.functions\.invoke\('purge-service-visit'/);
console.log('WAWIS 13.96 single-confirm trash purge regression: PASS');
