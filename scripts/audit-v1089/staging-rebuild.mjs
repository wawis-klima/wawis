import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {database,admin,ref,evidence} from './staging-common.mjs';
const db=await database();const results=[];
try{
 const identity=(await db.query('select current_database(),inet_server_addr()::text as server')).rows[0];
 if(process.argv.includes('--reset-audit-fixtures')){
  assert.equal((await db.query("select count(*)::int n from public.jobs where client not like 'Staging audit%' ")).rows[0].n,0,'non-audit job present');
  assert.equal((await db.query("select count(*)::int n from auth.users where email not like 'audit-%@example.invalid'")).rows[0].n,0,'non-audit Auth user present');
  const objects=(await db.query('select bucket_id,name,owner_id from storage.objects')).rows;
  const testOwners=new Set((await db.query("select id::text from auth.users where email like 'audit-%@example.invalid'")).rows.map(r=>r.id));
  for(const o of objects){assert.ok(testOwners.has(o.owner_id),'non-audit Storage owner present');const r=await admin.storage.from(o.bucket_id).remove([o.name]);assert.equal(r.error,null);}
  await db.query('drop schema private cascade;drop schema public cascade;create schema public authorization pg_database_owner;grant usage on schema public to postgres,anon,authenticated,service_role;grant all on schema public to postgres,service_role;');
 }
 const output=new URL('../../../staging-rebuild-final.sql',import.meta.url);
 execFileSync(process.execPath,['scripts/audit-v1089/emit-rebuild.mjs',ref,output.pathname.replace(/^\/([A-Z]:)/,'$1')],{stdio:'inherit'});
 const sql=fs.readFileSync(output,'utf8').replace(/^\\set ON_ERROR_STOP on\r?\n/,'');
 const hash=createHash('sha256').update(sql).digest('hex');
 for(let pass=1;pass<=2;pass++){await db.query(sql);results.push({pass,sha256:hash,success:true});console.log('STAGING FULL REPLAY PASS',pass);}
 evidence('staging-final-replays',{identity,results,resetApplicationSchemas:process.argv.includes('--reset-audit-fixtures')});
}catch(e){evidence('staging-rebuild-failure',{results,error:e.message});throw e;}finally{await db.end();}
