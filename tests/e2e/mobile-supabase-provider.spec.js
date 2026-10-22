import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
const fixturePath='work/offline-analysis/provider-fixture.json';
const sdk=(await build({stdin:{contents:"export { createClient } from '@supabase/supabase-js';",resolveDir:process.cwd()},bundle:true,format:'esm',write:false})).outputFiles[0].text;
test('@mobile actual local Supabase Storage + PostgREST: JW/JZ binary readback, device CAS, RLS, idempotency',async({page})=>{
  test.skip(!existsSync(fixturePath),'Requires explicitly started isolated provider: node scripts/offline-fixture/start.mjs');
  page.on('console', message => { if(message.type()==='error') console.log(message.text()); });
  page.on('requestfailed', request => console.log(request.failure()?.errorText, request.url()));
  await page.context().grantPermissions(['local-network-access']);
  const fixture=JSON.parse(readFileSync(fixturePath,'utf8'));
  await page.route('**/__provider_fixture__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Local Supabase integration</title>'}));
  await page.goto('/__provider_fixture__');
  const result=await page.evaluate(async({sdk,fixture})=>{
    const {createClient}=await import(URL.createObjectURL(new Blob([sdk],{type:'text/javascript'})));
    const requests=[];
    const fetchProvider=async(url,options)=>{
      const original=String(url);
      const target=original;
      const response=await fetch(target,options);
      requests.push({method:options?.method||'GET',storage:original.includes('/storage/'),status:response.status,bytes:options?.body instanceof ArrayBuffer?options.body.byteLength:null});
      return response;
    };
    const api=createClient('http://127.0.0.1:54327',fixture.anon,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+fixture.token},fetch:fetchProvider}});
    // No GoTrue in this isolated fixture. Storage/PostgREST validate a real signed
    // authenticated JWT and execute actual SQL/RLS; login UI is covered separately.
    api.auth.getUser=async()=>({data:{user:{id:fixture.userId}},error:null});
    const {queueNameplateDeviceIntent}=await import('/src/mobile791/modules/nameplate-device-intent.js');
    const {syncOfflineJobOperations}=await import('/src/mobile791/modules/job-offline-sync.js');
    const store=await import('/src/mobile791/modules/job-offline-store.js');
    fixture.jobId=crypto.randomUUID();
    const seeded=await api.from('jobs').insert({id:fixture.jobId,user_id:fixture.userId});
    if(seeded.error)throw new Error(JSON.stringify(seeded.error));
    const {data:base,error}=await api.from('jobs').select('*').eq('id',fixture.jobId).single();if(error)throw new Error(JSON.stringify(error));
    const originals = await Promise.all(['JW', 'JZ'].map(async label => {
      const canvas=document.createElement('canvas'); canvas.width=64;canvas.height=64;
      const ctx=canvas.getContext('2d'); ctx.fillStyle='white';ctx.fillRect(0,0,64,64);ctx.fillStyle='black';ctx.fillText(label,10,30);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.9));
      return new Uint8Array(await blob.arrayBuffer());
    }));
    const serial='FIXTURE-IN / FIXTURE-OUT-'+fixture.jobId;
    const op=await queueNameplateDeviceIntent({userId:fixture.userId,jobId:fixture.jobId,base,
      fields:{device_model:'TEST-MODEL-IN / TEST-MODEL-OUT',device_serial_number:serial},
      documents:['jw-1','jz'].map((unitRef,index)=>({file:new File([originals[index]],unitRef+'.jpg',{type:'image/jpeg'}),deviceIndex:0,unitRef,serialNumber:'FIXTURE-'+index,verified:false,ocrStatus:'manual'}))});
    const sync=await syncOfflineJobOperations({supabase:api,profile:{id:fixture.userId},jobId:fixture.jobId});
    const again=await syncOfflineJobOperations({supabase:api,profile:{id:fixture.userId},jobId:fixture.jobId});
    const rows=await api.from('photos').select('*').eq('job_id',fixture.jobId);
    const job=await api.from('jobs').select('*').eq('id',fixture.jobId).single();
    const persisted=[],dimensions=[];
    for(const [index,path] of op.payload.required_nameplate_paths.entries()){
      const r=await api.storage.from('job-photos').download(path);if(r.error)throw r.error;
      const bytes=new Uint8Array(await r.data.arrayBuffer());
      persisted.push(bytes.length===originals[index].length&&bytes.every((v,i)=>v===originals[index][i]));
      const bitmap=await createImageBitmap(r.data);dimensions.push([bitmap.width,bitmap.height]);bitmap.close();
    }
    const duplicateJob=crypto.randomUUID();
    const createDuplicate=await api.from('jobs').insert({id:duplicateJob,user_id:fixture.userId});
    if(createDuplicate.error)throw new Error(JSON.stringify(createDuplicate.error));
    const duplicate=await api.from('jobs').update({device_model:'OTHER',device_serial_number:serial}).eq('id',duplicateJob);
    const denied=await api.storage.from('job-photos').upload('33333333-3333-4333-8333-333333333333/forbidden.jpg',originals[0].buffer,{contentType:'image/jpeg'});
    return {jobId:fixture.jobId,serial,duplicateCode:duplicate.error?.code,sync,again,rows:rows.data?.length,model:job.data?.device_model,persisted,dimensions,requests,
      pending:(await store.listOfflineJobOperations(fixture.userId)).length,denied:Boolean(denied.error)};
  },{sdk,fixture});
  await test.info().attach('provider-requests.json',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  expect(result.jobId).toMatch(/^[0-9a-f-]{36}$/);
  const dockerEnv={...process.env};
  for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete dockerEnv[key];
  const devices=JSON.parse(execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','wawis-offline-fixture-pg','psql','-U','postgres','-At','-c',
    `select coalesce(json_agg(json_build_object('source',source_job_id,'model',model,'serial',serial_number)),'[]') from public.devices where source_job_id='${result.jobId}'`],{encoding:'utf8',env:dockerEnv}).trim());
  expect(devices).toEqual([{source:result.jobId,model:'TEST-MODEL-IN / TEST-MODEL-OUT',serial:result.serial}]);
  expect(result.duplicateCode).toBe('23505');
  await test.info().attach('actual-device-row.json',{body:JSON.stringify(devices,null,2),contentType:'application/json'});
  expect(result.sync.synced).toBe(1);expect(result.again.synced).toBe(0);
  expect(result.rows).toBe(2);expect(result.pending).toBe(0);expect(result.denied).toBe(true);
  expect(result.model).toBe('TEST-MODEL-IN / TEST-MODEL-OUT');
  expect(result.persisted).toEqual([true,true]);
  expect(result.dimensions).toEqual([[64,64],[64,64]]);
  expect(result.requests.filter(r=>r.storage&&r.method==='POST'&&r.bytes>0&&r.status===200)).toHaveLength(2);

});
