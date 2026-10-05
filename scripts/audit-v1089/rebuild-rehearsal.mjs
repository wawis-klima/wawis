import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const root=new URL('../../',import.meta.url);const manifest=JSON.parse(fs.readFileSync(new URL('supabase/rebuild/manifest-v1089.json',root),'utf8'));
const db=new PGlite();
// Platform doubles only. This is a dependency rehearsal, NOT Supabase/Storage/cron verification.
await db.exec(`create role anon;create role authenticated;create role service_role;create role supabase_admin;
create schema auth;create schema storage;create schema extensions;create schema private;create schema cron;
create function extensions.gen_random_bytes(integer) returns bytea language sql volatile as $fn$select decode(repeat('ab',$1),'hex')$fn$;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text);
create function auth.uid() returns uuid language sql as $$select null::uuid$$;
create function auth.role() returns text language sql as $$select 'service_role'::text$$;
create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb);
create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
create table cron.job(jobid bigint,jobname text,schedule text,command text,active boolean);
create function cron.unschedule(bigint) returns boolean language sql as $$select true$$;
create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;`);
let current='';
try{
for(let pass=1;pass<=(process.argv.includes('--replay')?2:1);pass++) for(const file of manifest.files){current=file;let sql=fs.readFileSync(new URL(file,root),'utf8');sql=sql.replace(/create extension if not exists (?:pgcrypto|pg_cron)[^;]*;/gi,'');await db.exec(sql);console.log('PASS',file);}
await db.exec(fs.readFileSync(new URL('supabase/rebuild/verify_audit_v1089.sql',root),'utf8'));
const legacySmsIndexes=await db.query("select indexname from pg_indexes where schemaname='public' and tablename='sms_log' and indexname in ('sms_log_job_reminder_for_date_idx','sms_log_job_service_cycle_idx','uq_sms_log_active_service_reminder_cycle')");
if(legacySmsIndexes.rows.length) throw new Error('Legacy SMS schedule indexes survived current rebuild');
await db.exec(`insert into public.jobs(id,client,phone,installation_date,sms_consent,sms_reminder_enabled,service_reminder_years)
values('90000000-0000-4000-8000-000000000001','Clock Fixture','500111222','2025-11-05',true,true,1)`);
const before=await db.query("select private.sms_actionable_queue_count_at(date '2026-10-04')::int as n");
const start=await db.query("select private.sms_actionable_queue_count_at(date '2026-10-05')::int as n");
const last=await db.query("select private.sms_actionable_queue_count_at(date '2026-12-06')::int as n");
const after=await db.query("select private.sms_actionable_queue_count_at(date '2026-12-07')::int as n");
if(before.rows[0].n!==0||start.rows[0].n!==1||last.rows[0].n!==1||after.rows[0].n!==0) throw new Error(`Fixed-clock SMS window mismatch: ${JSON.stringify({before:before.rows[0].n,start:start.rows[0].n,last:last.rows[0].n,after:after.rows[0].n})}`);
await db.exec("delete from public.jobs where id='90000000-0000-4000-8000-000000000001'");
await db.exec(fs.readFileSync(new URL('scripts/audit-v1089/fixtures/backend-restore.sql',root),'utf8'));console.log('Local dependency rehearsal + current SMS schema + fixed-clock window + delete/restore history PASS; this local run alone does not verify staging; see separate staging evidence');
}catch(e){console.error('FAIL',current,e.message); await db.exec('rollback'); const acl=fs.readFileSync(new URL('supabase/rebuild/20260917050212_n7_v1089_acl_grants_baseline.sql',root),'utf8'); for(const m of acl.matchAll(/public\.[a-z_]+\([^)]*\)/g)){const result=await db.query('select to_regprocedure($1)::text as signature',[m[0]]);if(!result.rows[0].signature)console.log('MISSING',m[0]);}process.exitCode=1;}finally{await db.close();}
