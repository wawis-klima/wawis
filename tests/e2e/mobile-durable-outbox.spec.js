import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
const oldQueue3 = execFileSync('git', ['show', '84bd0936:src/mobile791/modules/photo-offline-queue.js'], {encoding:'utf8'})
  .replace("'../../modules/diagnostics-package4.js'", "'/src/modules/diagnostics-package4.js'");
const oldQueue4 = execFileSync('git', ['show', '826ce473:src/mobile791/modules/photo-offline-queue.js'], {encoding:'utf8'})
  .replace("'../../modules/diagnostics-package4.js'", "'/src/modules/diagnostics-package4.js'");
async function fixture(page) {
  await page.route('**/__durable_fixture__', r => r.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated outbox fixture</title>'}));
  await page.goto('/__durable_fixture__');
}
test('@mobile RED/GREEN rollback v4 -> original v3 fails without deleting bytes; compatible v4 reads them', async ({page}) => {
  await fixture(page);
  const result = await page.evaluate(async source => {
    await new Promise((resolve,reject) => {
      const r = indexedDB.open('wawis-mobile-photo-queue', 4);
      r.onupgradeneeded = () => r.result.createObjectStore('queued-photos',{keyPath:'id'});
      r.onerror = () => reject(r.error);
      r.onsuccess = () => {const db=r.result,tx=db.transaction('queued-photos','readwrite');
        tx.objectStore('queued-photos').put({id:'v4',user_id:'u',job_id:'j',local_file:new File(['preserved-original'], 'jz.jpg')});
        tx.oncomplete=()=>{db.close();resolve();};};
    });
    const legacy = await import(URL.createObjectURL(new Blob([source.replace("'/src/modules/diagnostics-package4.js'", JSON.stringify(location.origin + "/src/modules/diagnostics-package4.js"))],{type:'text/javascript'})));
    const old = await legacy.listPhotoQueueItems();
    const q = await import('/src/mobile791/modules/photo-offline-queue.js');
    return {old:old.length,now:(await q.listPhotoQueueItems()).length,bytes:await (await q.listPhotoQueueItems())[0].local_file.text()};
  },oldQueue3);
  expect(result).toEqual({old:0,now:1,bytes:'preserved-original'});
});
test('@mobile RED/GREEN File reserialization failure at claim-write; owned ArrayBuffer survives same failure', async ({page}) => {
  await fixture(page);
  const result = await page.evaluate(async source => {
    const old=await import(URL.createObjectURL(new Blob([source.replace("'/src/modules/diagnostics-package4.js'", JSON.stringify(location.origin + "/src/modules/diagnostics-package4.js"))],{type:'text/javascript'})));
    await old.savePhotoQueueItem({id:'rewrite',user_id:'u',job_id:'j',__localFile:new File(['ORIGINAL-JZ'],'jz.jpg')});
    const first=await old.claimPhotoQueueItem('rewrite');
    const nativePut=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,...args) {
      if(value.retry_count===1 && value.local_file instanceof Blob) throw new DOMException('fixture: cannot rewrite File handle','DataCloneError');
      return nativePut.call(this,value,...args);
    };
    const guard={expectedLeaseOwner:first.lease_owner,expectedGeneration:first.attempt_generation};
    const red=await old.updatePhotoQueueItem('rewrite',{retry_count:1},guard);
    await old.releaseClaimedPhotoQueueItem('rewrite',first);
    const q=await import('/src/mobile791/modules/photo-offline-queue.js');
    const second=await q.claimPhotoQueueItem('rewrite');
    const green=await q.updatePhotoQueueItem('rewrite',{retry_count:1},{expectedLeaseOwner:second.lease_owner,expectedGeneration:second.attempt_generation});
    IDBObjectStore.prototype.put=nativePut;
    return {red,green,bytes:await (await q.listPhotoQueueItems())[0].local_file.text()};
  },oldQueue4);
  expect(result).toEqual({red:false,green:true,bytes:'ORIGINAL-JZ'});
});
async function installCase(page) {
  await fixture(page);
  await page.evaluate(async () => {
    const intent=await import('/src/mobile791/modules/nameplate-device-intent.js');
    const store=await import('/src/mobile791/modules/job-offline-store.js');
    const queue=await import('/src/mobile791/modules/photo-offline-queue.js');
    const sync=await import('/src/mobile791/modules/job-offline-sync.js');
    const photos=await import('/src/mobile791/modules/photos.js');
    const device=JSON.stringify([{model:'TEST-I',serial_number:'TEST-IN',outdoor_model:'TEST-O',outdoor_serial_number:'TEST-OUT'}]);
    const c={intent,store,queue,sync,photos,uploads:[],objects:new Map(),rows:[],status:0,failAt:0,session:true,
      job:{id:'test-job',status:'W trakcie',device_model:null,device_serial_number:null}, device,
      profile:{id:'owner'},setJobs:()=>{},setSelectedJob:()=>{}};
    c.api={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},storage:{from(){return{
      async upload(path,bytes){
        if(!(bytes instanceof ArrayBuffer)||!bytes.byteLength)throw new Error('empty transport');
        c.uploads.push(path);
        if(c.status && (!c.failAt||c.uploads.length===c.failAt))return {error:{statusCode:c.status,message:'fixture failure'}};
        if(c.objects.has(path))return {error:{statusCode:409,message:'Duplicate'}};
        c.objects.set(path,bytes.slice(0));return {data:{path},error:null};
      },
      async download(path){return c.objects.has(path)?{data:new Blob([c.objects.get(path)]),error:null}:{error:{statusCode:404,message:'missing'}};},
      async createSignedUrl(){return {data:{signedUrl:'https://fixture.invalid/photo'}};},
    };}},from(table){
      const filters=[];let inserting=null,updating=null;
      const query={select(){return this;},eq(k,v){filters.push([k,v]);return this;},is(k,v){filters.push([k,v]);return this;},order(){return this;},
        insert(value){inserting=value;return this;},update(value){updating=value;return this;},
        async maybeSingle(){
          if(table==='jobs'){
            if(!filters.every(([k,v])=>c.job[k]===v))return {data:null,error:null};
            if(updating)Object.assign(c.job,updating);
            return {data:{...c.job},error:null};
          }
          return {data:c.rows.find(row=>filters.every(([k,v])=>row[k]===v))||null,error:null};
        },
        async single(){const row={...inserting,id:crypto.randomUUID()};c.rows.push(row);return {data:row,error:null};},
        then(resolve,reject){return Promise.resolve({data:c.rows.filter(row=>filters.every(([k,v])=>row[k]===v)),error:null}).then(resolve,reject);},
      };return query;
    }};
    c.create=()=>intent.queueNameplateDeviceIntent({userId:'owner',jobId:'test-job',base:{device_model:'',device_serial_number:''},
      fields:{device_model:device,device_serial_number:'TEST-IN / TEST-OUT'},
      documents:['jw-1','jz'].map((unitRef,index)=>({file:new File([new Uint8Array([255,216,255,index,4,5,255,217])],unitRef+'.jpg',{type:'image/jpeg'}),deviceIndex:0,unitRef,serialNumber:index?'TEST-OUT':'TEST-IN',verified:false,ocrStatus:'manual'}))});
    c.options={supabase:c.api,profile:c.profile,jobId:'test-job',isSessionCurrent:()=>c.session};
    window.outboxCase=c;
  });
}
test('@mobile atomic intent stores JW/JZ bytes, remains offline, reload restores both without AI approval',async({page})=>{
  await installCase(page);
  const saved=await page.evaluate(async()=>{
    const c=window.outboxCase,op=await c.create();
    return {docs:op.payload.documentation.map(d=>({size:d.file.byteLength,verified:d.verified,status:d.ocrStatus})),ops:(await c.store.listOfflineJobOperations('owner')).length,uploads:c.uploads.length};
  });
  expect(saved).toEqual({docs:[{size:8,verified:false,status:'manual'},{size:8,verified:false,status:'manual'}],ops:1,uploads:0});
  await page.reload();
  const restored=await page.evaluate(async()=>{
    const s=await import('/src/mobile791/modules/job-offline-store.js'),i=await import('/src/mobile791/modules/nameplate-device-intent.js');
    const ops=await s.listOfflineJobOperations('owner');const docs=await i.restoreIntentDocuments(ops[0]);return docs.map(d=>[d.file.size,d.verified]);
  });
  expect(restored).toEqual([[8,false],[8,false]]);
});
test('@mobile online JW/JZ: bytes -> Storage readback -> metadata -> device -> no duplicate on repeated sync',async({page})=>{
  await installCase(page);
  const result=await page.evaluate(async()=>{const c=window.outboxCase;await c.create();
    const first=await c.sync.syncOfflineJobOperations(c.options),second=await c.sync.syncOfflineJobOperations(c.options);
    return {synced:first.synced,second:second.synced,rows:c.rows.length,objects:c.objects.size,ops:(await c.store.listOfflineJobOperations('owner')).length,serial:c.job.device_serial_number};});
  expect(result).toEqual({synced:1,second:0,rows:2,objects:2,ops:0,serial:'TEST-IN / TEST-OUT'});
});
for(const status of [400,403,409,429,503])test(`@mobile HTTP ${status}: retains complete intent and bytes, classifies retry, never commits device`,async({page})=>{
  await installCase(page);
  const result=await page.evaluate(async status=>{const c=window.outboxCase;await c.create();c.status=status;
    await c.sync.syncOfflineJobOperations(c.options);
    const q=await c.queue.listPhotoQueueItems(),ops=await c.store.listOfflineJobOperations('owner');
    return {photos:q.length,docs:ops[0].payload.documentation.length,device:c.job.device_model,status:q.map(p=>p.upload_status)};},status);
  expect(result.photos).toBe(2);expect(result.docs).toBe(2);expect(result.device).toBeNull();
  expect(result.status).toEqual(status>=429?['local','local']:['error','error']);
});
test('@mobile disconnect on second photo: first survives, retry adds only missing row and device',async({page})=>{
  await installCase(page);
  const result=await page.evaluate(async()=>{const c=window.outboxCase;await c.create();c.status=503;c.failAt=2;
    await c.sync.syncOfflineJobOperations(c.options);const partial={rows:c.rows.length,objects:c.objects.size,device:c.job.device_model};
    c.status=0;await c.photos.retryAllPersistedPhotoUploads(c.options);
    await c.store.makeOfflineJobOperationsRetryableNow('owner');await c.sync.syncOfflineJobOperations(c.options);
    return {partial,rows:c.rows.length,objects:c.objects.size,ops:(await c.store.listOfflineJobOperations('owner')).length};});
  expect(result).toEqual({partial:{rows:1,objects:1,device:null},rows:2,objects:2,ops:0});
});
test('@mobile user change/session cancellation cannot send or acknowledge another user intent',async({page})=>{
  await installCase(page);
  const result=await page.evaluate(async()=>{const c=window.outboxCase;await c.create();
    await c.sync.syncOfflineJobOperations({...c.options,profile:{id:'other'}});
    c.session=false;await c.sync.syncOfflineJobOperations(c.options);
    const before=c.uploads.length;c.session=true;await c.sync.syncOfflineJobOperations(c.options);
    return {before,after:c.uploads.length,ops:(await c.store.listOfflineJobOperations('owner')).length};});
  expect(result).toEqual({before:0,after:2,ops:0});
});
test('@mobile empty photo and quota failure cannot close an uncommitted form or replace prior intent',async({page})=>{
  await installCase(page);
  const result=await page.evaluate(async()=>{const c=window.outboxCase;const op=await c.create();let empty=false,quota=false;
    try{await c.intent.queueNameplateDeviceIntent({userId:'owner',jobId:'test-job',fields:{},documents:[{file:new File([],'empty.jpg')}]});}catch{empty=true;}
    const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,...a){if(v.type==='device')throw new DOMException('fixture','QuotaExceededError');return put.call(this,v,...a);};
    try{await c.create();}catch{quota=true;}finally{IDBObjectStore.prototype.put=put;}
    const remaining=await c.store.listOfflineJobOperations('owner');return {empty,quota,same:remaining[0].id===op.id,count:remaining.length};});
  expect(result).toEqual({empty:true,quota:true,same:true,count:1});
});
test('@mobile two workers claim one intent; stale generation cannot delete or overwrite successor',async({page})=>{
  await installCase(page);
  const result=await page.evaluate(async()=>{const c=window.outboxCase,op=await c.create();
    const claims=await Promise.all([c.store.claimOfflineJobOperation(op.id),c.store.claimOfflineJobOperation(op.id)]);
    const winner=claims.find(Boolean),g=c.store.offlineOperationGuard(winner);
    await c.store.updateOfflineJobOperation(op.id,{lease_until:new Date(0).toISOString()},g);
    const next=await c.store.claimOfflineJobOperation(op.id);
    const staleDelete=await c.store.deleteOfflineJobOperation(op.id,g),staleWrite=await c.store.updateOfflineJobOperation(op.id,{status:'error'},g);
    return {winners:claims.filter(Boolean).length,staleDelete,staleWrite,generation:next.attempt_generation,docs:(await c.store.listOfflineJobOperations('owner'))[0].payload.documentation.length};});
  expect(result).toEqual({winners:1,staleDelete:false,staleWrite:false,generation:2,docs:2});
});
test('@mobile refresh overlay retains intent; protocol blocked until server device and photos acknowledged',async({page})=>{
  await installCase(page);
  const result=await page.evaluate(async()=>{const c=window.outboxCase,op=await c.create();
    const {overlayPendingDeviceOperation}=await import('/src/mobile791/modules/job-pending-device-overlay.js');
    const {areJobNameplatesReadyForProtocol}=await import('/src/mobile791/modules/nameplate-requirements.js');
    const refreshed=overlayPendingDeviceOperation({...c.job},[op]);
    const blocked=areJobNameplatesReadyForProtocol({...refreshed,photos:[]});
    return {retained:refreshed.device_model===op.payload.device_fields.device_model,pending:refreshed.offline_pending,blocked};});
  expect(result).toEqual({retained:true,pending:true,blocked:false});
});
test('@mobile two independent tabs compete for the durable device intent',async({page,context})=>{
  await installCase(page);
  const id=await page.evaluate(async()=> (await window.outboxCase.create()).id);
  const second=await context.newPage();await fixture(second);
  const claim=(tab)=>tab.evaluate(async id=>{const s=await import('/src/mobile791/modules/job-offline-store.js');const c=await s.claimOfflineJobOperation(id);return c?{owner:c.lease_owner,generation:c.attempt_generation}:null;},id);
  const claims=await Promise.all([claim(page),claim(second)]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  expect(claims.find(Boolean).generation).toBe(1);
  await second.close();
});
test('@mobile logout during real queue upload preserves bytes and recovers via Storage conflict on relogin',async({page})=>{
  await installCase(page);
  const result=await page.evaluate(async()=>{
    const c=window.outboxCase;await c.create();
    const from=c.api.storage.from;
    let cancelled=false;
    c.api.storage.from=function(...args){const bucket=from.apply(this,args),upload=bucket.upload;
      bucket.upload=async(...input)=>{const r=await upload(...input);if(!cancelled){cancelled=true;c.session=false;}return r;};return bucket;};
    await c.sync.syncOfflineJobOperations(c.options);
    const before={docs:(await c.store.listOfflineJobOperations('owner'))[0].payload.documentation.length,rows:c.rows.length,objects:c.objects.size};
    c.session=true;
    await c.store.makeOfflineJobOperationsRetryableNow('owner');
    await c.photos.retryAllPersistedPhotoUploads(c.options);
    await c.sync.syncOfflineJobOperations(c.options);
    return {before,rows:c.rows.length,objects:c.objects.size,pending:(await c.store.listOfflineJobOperations('owner')).length};
  });
  expect(result).toEqual({before:{docs:2,rows:0,objects:1},rows:2,objects:2,pending:0});
});
