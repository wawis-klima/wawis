import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const root=new URL('../../',import.meta.url);const manifest=JSON.parse(fs.readFileSync(new URL('supabase/rebuild/manifest-v1089.json',root),'utf8'));
const db=new PGlite();
// Platform doubles only. This is a dependency rehearsal, NOT Supabase/Storage/cron verification.
await db.exec(`create role anon;create role authenticated;create role service_role;create role supabase_admin;
create schema auth;create schema storage;create schema extensions;create schema private;create schema cron;
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
await db.exec(fs.readFileSync(new URL('supabase/rebuild/verify_audit_v1089.sql',root),'utf8'));await db.exec(fs.readFileSync(new URL('scripts/audit-v1089/fixtures/backend-restore.sql',root),'utf8'));console.log('Local dependency rehearsal + catalog checks + delete/restore history PASS; staging remains unverified');
}catch(e){console.error('FAIL',current,e.message); await db.exec('rollback'); const acl=fs.readFileSync(new URL('supabase/rebuild/20260917050212_n7_v1089_acl_grants_baseline.sql',root),'utf8'); for(const m of acl.matchAll(/public\.[a-z_]+\([^)]*\)/g)){const result=await db.query('select to_regprocedure($1)::text as signature',[m[0]]);if(!result.rows[0].signature)console.log('MISSING',m[0]);}process.exitCode=1;}finally{await db.close();}
