import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {admin,client,database,evidence} from './staging-common.mjs';
import {addFuelEntry} from '../../src/modules/fuel.js';
const db=await database();const actors={};const checks=[];
const ok=(r,label)=>{assert.equal(r.error,null,`${label}: ${r.error?.message}`);return r.data;};
try{
 for(const role of ['admin','worker','other','pending','missing']){
  const email=`audit-${role}-${randomUUID()}@example.invalid`,password=randomUUID()+'aA!2';
  const user=ok(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{role:'Administrator',full_name:'Staging audit'}}),'create Auth user').user;
  const profile=(await db.query('select role from public.profiles where id=$1',[user.id])).rows[0];
  assert.equal(profile.role,'Oczekujący','Auth trigger must ignore forged metadata role');
  if(['admin','worker','other'].includes(role))await db.query('update public.profiles set role=$2 where id=$1',[user.id,role==='admin'?'Administrator':'Pracownik']);
  if(role==='missing')await db.query('delete from public.profiles where id=$1',[user.id]);
  const session=ok(await client().auth.signInWithPassword({email,password}),'Auth password sign-in').session;
  actors[role]={id:user.id,email,password,token:session.access_token,refreshToken:session.refresh_token};
 }
 checks.push('Real Auth createUser trigger ignores forged metadata, real password sign-in for five roles');
 fs.writeFileSync(process.env.WAWIS_STAGING_ACTORS,JSON.stringify(actors));
 const a=client(actors.admin.token),w=client(actors.worker.token),other=client(actors.other.token),p=client(actors.pending.token),missing=client(actors.missing.token),anon=client();
 ok(await w.auth.setSession({access_token:actors.worker.token,refresh_token:actors.worker.refreshToken}),'worker client session');
 const phone=String(Date.now());
 const contractor=ok(await a.from('contractors').insert({company_name:`Staging audit ${randomUUID()}`,phone,city:'HQ',street:'Main'}).select().single(),'admin contractor');
 const job=ok(await a.from('jobs').insert({client:'Staging audit',contractor_id:contractor.id,status:'W trakcie',device_model:'Split',created_by:actors.admin.id,main_technician_id:actors.worker.id,email:'audit@example.invalid'}).select().single(),'admin job');
 const ids={job:job.id,contractor:contractor.id};
 for(const [role,c] of [['admin',a],['worker',w],['pending',p],['missing',missing],['anon',anon]]){
  for(const table of ['jobs','contractors','devices','photos','fuel_entries']){
   const r=await c.from(table).select('id').limit(20);
   if(['pending','missing','anon'].includes(role))assert.ok(r.error||r.data.length===0,`${role} leaked ${table}`);
   else assert.equal(r.error,null,`${role} ${table}`);
  }
  const callback=await c.rpc('apply_sms_delivery_atomic',{p_provider_message_id:'not-existing',p_status:'delivered'});
  assert.ok(callback.error,`${role} must not call callback service RPC`);
 }
 const workerPatch=await w.from('contractors').update({phone:'ILLEGAL'}).eq('id',contractor.id).select();
 assert.ok(workerPatch.error||workerPatch.data.length===0);
 assert.equal(ok(await a.from('contractors').select('phone').eq('id',contractor.id).single(),'read phone').phone,phone);
 await p.from('profiles').update({role:'Administrator'}).eq('id',actors.pending.id);
 assert.equal((await db.query('select role from profiles where id=$1',[actors.pending.id])).rows[0].role,'Oczekujący');
 checks.push('PostgREST admin/worker/pending/missing/anon reads; worker direct contractor UPDATE denied; profile escalation denied; callback ACL denied');
 const image=new Uint8Array([255,216,255,217]);
 const photoPaths=[];
 for(const unit of ['jz','jw-1']){
  const path=`${job.id}/audit-${unit}.jpg`;photoPaths.push(path);
  ok(await w.storage.from('job-photos').upload(path,image,{contentType:'image/jpeg'}),'worker job upload');
  ok(await w.storage.from('job-photos').download(path),'worker job download');
  ok(await w.from('photos').insert({job_id:job.id,uploaded_by:actors.worker.id,photo_kind:'nameplate',device_index:1,unit_ref:unit,storage_path:path}).select().single(),'nameplate photo row');
 }
 for(const c of [p,missing,anon])assert.ok((await c.storage.from('job-photos').upload(`${job.id}/${randomUUID()}.jpg`,image,{contentType:'image/jpeg'})).error,'nonstaff upload denied');
 ok(await a.from('jobs').update({status:'Zakończone'}).eq('id',job.id),'complete with nameplates');
 assert.ok((await a.from('jobs').update({device_model:'Split\nSecond split'}).eq('id',job.id)).error,'completed model edit requires photos');
 assert.ok((await a.from('jobs').update({device_serial_number:'JW2: additional'}).eq('id',job.id)).error,'completed serial edit requires JW2');
 assert.ok((await a.from('photos').delete().eq('job_id',job.id).eq('unit_ref','jz')).error,'required nameplate row cannot delete');
 const deletion=await a.storage.from('job-photos').remove([photoPaths[0]]);
 assert.ok(deletion.error||deletion.data.length===0,'referenced required file cannot delete');
 ok(await w.storage.from('job-photos').download(photoPaths[0]),'retained photo still exists');
 checks.push('Actual job-photo upload/download, denied nonstaff uploads, completed nameplate revalidation and required-row/file retention');
 const vehicle=ok(await a.from('fuel_vehicles').insert({registration_number:`WA${String(Date.now()).slice(-5)}`,is_active:true,created_by:actors.admin.id}).select().single(),'vehicle');ids.vehicle=vehicle.id;
 const fuel=await addFuelEntry({supabase:w,ownerUserId:actors.worker.id,vehicleId:vehicle.id,liters:40,odometerKm:12000,odometerPhotoBlob:new Blob([image],{type:'image/jpeg'}),entryId:randomUUID()});ids.fuel=fuel.id;
 ok(await w.storage.from('fuel-odometer-photos').download(fuel.odometer_photo_path),'owner fuel photo');
 ok(await a.storage.from('fuel-odometer-photos').download(fuel.odometer_photo_path),'admin fuel photo');
 assert.ok((await other.storage.from('fuel-odometer-photos').download(fuel.odometer_photo_path)).error,'other worker cannot read fuel photo');
 assert.ok((await other.storage.from('fuel-odometer-photos').upload(`${actors.worker.id}/${randomUUID()}.jpg`,image,{contentType:'image/jpeg'})).error,'other worker cannot write owner namespace');
 const retry=await addFuelEntry({supabase:w,ownerUserId:actors.worker.id,vehicleId:vehicle.id,liters:40,odometerKm:12000,entryId:fuel.id,existingPhotoPath:fuel.odometer_photo_path});assert.equal(retry.id,fuel.id);
 assert.equal((await db.query('select count(*)::int as n from fuel_entries where id=$1',[fuel.id])).rows[0].n,1);
 checks.push('Actual Fuel module upload/INSERT/retry through Storage+PostgREST; one row; cross-owner read/write denied');
 actors.fixture=ids;fs.writeFileSync(process.env.WAWIS_STAGING_ACTORS,JSON.stringify(actors));
 evidence('staging-api',{checks,ids,roles:Object.fromEntries(Object.entries(actors).filter(([k])=>k!=='fixture').map(([k,v])=>[k,v.id]))});
 console.log('STAGING API PASS',checks);
}catch(e){evidence('staging-api-failure',{checks,error:e.message});throw e;}finally{await db.end();}
