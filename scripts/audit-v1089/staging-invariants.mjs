import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {database,evidence} from './staging-common.mjs';
const actors=JSON.parse(fs.readFileSync(process.env.WAWIS_STAGING_ACTORS));const db=await database();const checks=[];let cronId;
try{
 await db.query(fs.readFileSync(new URL('../../supabase/rebuild/verify_audit_v1089.sql',import.meta.url),'utf8'));checks.push('Catalog signature/RLS/private ACL/Storage retention verification');
 const restore=fs.readFileSync(new URL('./fixtures/backend-restore.sql',import.meta.url),'utf8').replace(/^create or replace function auth\.(uid|role)\(\).*;\r?\n/gm,'');await db.query(restore);checks.push('Actual full schema delete/archive/restore: photos, comments, protocol, access, devices, SMS, timestamp; missing-photo rollback');
 await db.query('begin');
 const contractor=randomUUID(),job=randomUUID();
 await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[actors.admin.id]);
 await db.query("insert into contractors(id,company_name,phone,city,street,addresses) values($1,$2,'222','HQ','Main',$3)",[contractor,'Staging audit contact '+randomUUID(),JSON.stringify([{id:'primary',city:'HQ',street:'Main',is_primary:true},{id:'secondary',city:'Branch',street:'Other',is_primary:false}])]);
 await db.query("insert into jobs(id,contractor_id,client,phone,city,street,contractor_address_id,status,main_technician_id) values($1,$2,'Original','111','Branch','Other','secondary','W trakcie',$3)",[job,contractor,actors.worker.id]);
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actors.worker.id]);await db.query('set local role authenticated');
 await db.query("update jobs set client=$2 where id=$1",[job,'Renamed '+randomUUID()]);let row=(await db.query('select phone,city,street,addresses from contractors where id=$1',[contractor])).rows[0];assert.equal(row.phone,'222');assert.equal(row.city,'HQ');assert.equal(row.addresses[1].city,'Branch');
 await db.query("update jobs set phone='333',street='Changed secondary' where id=$1",[job]);row=(await db.query('select phone,street,addresses from contractors where id=$1',[contractor])).rows[0];assert.equal(row.phone,'333');assert.equal(row.street,'Main');assert.equal(row.addresses[1].street,'Changed secondary');await db.query('rollback');checks.push('A01 real authenticated worker: name-only preserves 222/HQ/Branch, explicit phone/secondary street patch');
 const jobId=randomUUID();await db.query("insert into jobs(id,client,status,created_at) values($1,$2,'Nowe',now()-interval '31 days')",[jobId,'Staging audit cron '+randomUUID()]);
 const configured=(await db.query("select schedule,command,active from cron.job where jobname='wawis-stale-new-jobs-v1079'")).rows;assert.equal(configured.length,1);assert.equal(configured[0].schedule,'17 * * * *');assert.equal(configured[0].active,true);
 cronId=(await db.query("select cron.schedule($1,'1 second','select private.refresh_stale_new_jobs();') id",['audit-v1089-'+randomUUID()])).rows[0].id;
 let runs=[];for(let i=0;i<25;i++){runs=(await db.query("select status,return_message,start_time,end_time from cron.job_run_details where jobid=$1 and status='succeeded'",[cronId])).rows;if(runs.length)break;await new Promise(r=>setTimeout(r,1000));}
 assert.ok(runs.length,'real cron worker did not succeed');assert.equal((await db.query('select status from jobs where id=$1',[jobId])).rows[0].status,'Niezrealizowane');checks.push('Actual pg_cron worker executed maintenance; 31-day fixture moved to Niezrealizowane; hourly production-equivalent schedule unique');
 evidence('staging-invariants-cron',{checks,configured,runs});console.log('STAGING INVARIANTS/CRON PASS',checks);
}finally{await db.query('rollback');if(cronId)await db.query('select cron.unschedule($1::bigint)',[cronId]);await db.end();}
