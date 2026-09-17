import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {client,evidence} from './staging-common.mjs';
const actors=JSON.parse(fs.readFileSync(process.env.WAWIS_STAGING_ACTORS));const a=client(actors.admin.token),w=client(actors.worker.token);const ok=r=>{assert.equal(r.error,null,r.error?.message);return r.data;};
const job=ok(await a.from('jobs').insert({client:'Staging audit devices '+randomUUID(),status:'W trakcie',device_model:'First\nSecond',created_by:actors.admin.id,main_technician_id:actors.worker.id}).select().single());const paths={1:[],2:[]};const image=new Uint8Array([255,216,255,217]);
for(const device of [1,2])for(const unit of ['jz','jw-1']){const path=`${job.id}/nameplates/device-${device}_${unit}_${randomUUID()}.jpg`;paths[device].push(path);ok(await w.storage.from('job-photos').upload(path,image,{contentType:'image/jpeg'}));ok(await w.from('photos').insert({job_id:job.id,photo_kind:'nameplate',device_index:device,unit_ref:unit,uploaded_by:actors.worker.id,storage_path:path}));}
const result=ok(await a.rpc('admin_delete_job_device',{p_job_id:job.id,p_device_index:1}));assert.deepEqual(new Set(result.cleanup_storage_paths),new Set(paths[1]));
const remaining=ok(await a.from('photos').select('device_index,storage_path').eq('job_id',job.id));assert.equal(remaining.length,2);assert.ok(remaining.every(r=>r.device_index===1));assert.deepEqual(new Set(remaining.map(r=>r.storage_path)),new Set(paths[2]));
for(const path of paths[2])ok(await w.storage.from('job-photos').download(path));
const removed=ok(await a.storage.from('job-photos').remove(result.cleanup_storage_paths));assert.equal(removed.length,2);
for(const path of paths[2])ok(await w.storage.from('job-photos').download(path));
ok(await a.from('jobs').update({status:'Zakończone'}).eq('id',job.id));
evidence('staging-devices',{checks:['Real device deletion RPC shifts nameplate indexes while retaining actual surviving Storage paths','Only unreferenced deleted-device files removed through Storage API; surviving files still downloadable','Remaining device completes with JW/JZ'],job:job.id});console.log('STAGING device/nameplate Storage PASS');
