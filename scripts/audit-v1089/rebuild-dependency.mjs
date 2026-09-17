import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs';
const db=new PGlite();
try {
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
await db.exec('create schema private;create schema auth;create role anon;create role authenticated;create role service_role;create function auth.uid() returns uuid language sql as $$select null::uuid$$;');
await db.exec('create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text);');
await db.exec(read('supabase/rebuild/legacy_schema_bootstrap_v1089.sql').replace('create extension if not exists pgcrypto;',''));
await db.exec(read('supabase/rebuild/legacy_helpers_bootstrap_v1089.sql'));
await db.exec('create table job_protocols(id uuid,storage_path text);');
if(!process.argv.includes('--baseline')) await db.exec(read('supabase/rebuild/legacy_service_archive_v1089.sql'));
const file=new URL('../../supabase/rebuild/20260917050029_n7_v1089_triggers_baseline.sql',import.meta.url);
const sql=fs.readFileSync(file,'utf8');
const statement=sql.split(';').find(x=>x.includes('CREATE TRIGGER archive_job_before_delete'));
await db.exec(statement);
console.log('A07 archive trigger dependency present');
} catch(e){console.error('A07',e.message);process.exitCode=1;}finally{await db.close();}
