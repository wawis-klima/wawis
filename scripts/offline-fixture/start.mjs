// Isolated provider fixture. NEVER points at a linked Supabase project.
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const dockerEnv={...process.env};
for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete dockerEnv[key];
const docker=(...args)=>execFileSync('docker',['--host=unix:///var/run/docker.sock',...args],{encoding:'utf8',env:dockerEnv});
const secret='wawis-isolated-fixture-secret-32-characters-minimum';
const token=role=>{const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const payload=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role,sub:'11111111-1111-4111-8111-111111111111',exp:Math.floor(Date.now()/1000)+86400});
 return payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');};
const prefix='wawis-offline-fixture',net=prefix+'-net';
try{docker('network','inspect',net);}catch{docker('network','create',net);}
for(const name of ['storage','rest','pg'])try{docker('rm','-f',prefix+'-'+name);}catch{}
docker('run','-d','--name',prefix+'-pg','--network',net,'-e','POSTGRES_PASSWORD=fixture-only','postgres:17-alpine');
let ready=false;
for(let i=0;i<60;i++){try{docker('exec',prefix+'-pg','pg_isready','-h','127.0.0.1','-U','postgres');ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
if(!ready)throw new Error('Postgres fixture not ready');
function sql(query){execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',prefix+'-pg','psql','-U','postgres','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',env:dockerEnv});}
sql(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
create table public.jobs(id uuid primary key, user_id uuid not null, status text default 'W trakcie',contractor_id uuid,installation_date date,service_reminder_years int default 5,device_model text,device_serial_number text);
create table public.devices(id uuid primary key default gen_random_uuid(),contractor_id uuid,source_job_id text unique,source_kind text,model text,serial_number text,installation_date date,service_reminder_years int,status text,notes text,updated_at timestamptz default now());
create unique index devices_serial_number_key on public.devices(lower(btrim(serial_number))) where nullif(btrim(serial_number),'') is not null;
create table public.photos(id uuid primary key default gen_random_uuid(),job_id uuid references public.jobs(id),image_url text,storage_path text unique,uploaded_by uuid,created_at timestamp default now(),photo_kind text,device_index int,unit_ref text,ocr_status text,ocr_checked_at timestamptz);
alter table public.jobs enable row level security; alter table public.photos enable row level security;
create policy job_owner on public.jobs to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy photo_owner on public.photos to authenticated using(exists(select 1 from public.jobs j where j.id=job_id and j.user_id=auth.uid())) with check(uploaded_by=auth.uid() and exists(select 1 from public.jobs j where j.id=job_id and j.user_id=auth.uid()));
grant usage on schema public,auth to authenticated,anon,service_role;
grant all on public.jobs,public.photos to authenticated,service_role;
insert into public.jobs(id,user_id) values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111');`);
// Run the repository's exact existing sync function, already compared with the
// read-only production definition. This is fixture setup, never a migration.
const source=readFileSync('supabase/rebuild/20260917045924_n7_v1089_function_exactness_fix.sql','utf8');
const begin=source.indexOf('CREATE OR REPLACE FUNCTION public.sync_device_from_job_row(');
const end=source.indexOf('$function$;',source.indexOf('AS $function$',begin))+12;
if(begin<0||end<begin)throw new Error('Existing device sync function not found');
sql(source.slice(begin,end));
sql(`create function public.fixture_sync_device_trigger() returns trigger language plpgsql as $$ begin
perform public.sync_device_from_job_row(new.id::text,new.contractor_id,new.device_model,new.device_serial_number,new.installation_date);return new;end $$;
create trigger fixture_job_device after insert or update of device_model,device_serial_number on public.jobs for each row execute function public.fixture_sync_device_trigger();`);
docker('run','-d','--name',prefix+'-rest','--network',net,'-p','127.0.0.1:54328:3000',
 '-e',`PGRST_DB_URI=postgres://postgres:fixture-only@${prefix}-pg:5432/postgres`,
 '-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon','-e',`PGRST_JWT_SECRET=${secret}`,'postgrest/postgrest:v12.2.12');
docker('run','-d','--name',prefix+'-storage','--network',net,'-p','127.0.0.1:54329:5000',
 '-e',`DATABASE_URL=postgres://postgres:fixture-only@${prefix}-pg:5432/postgres`,
 '-e',`POSTGREST_URL=http://${prefix}-rest:3000`,'-e',`PGRST_JWT_SECRET=${secret}`,
 '-e',`ANON_KEY=${token('anon')}`,'-e',`SERVICE_KEY=${token('service_role')}`,
 '-e','STORAGE_BACKEND=file','-e','FILE_STORAGE_BACKEND_PATH=/var/lib/storage',
 '-e','TENANT_ID=fixture','-e','REGION=local','-e','GLOBAL_S3_BUCKET=fixture',
 '-e','FILE_SIZE_LIMIT=52428800','supabase/storage-api:v1.80.2');
let storageReady=false;
for(let i=0;i<60;i++){
 try{const r=await fetch('http://127.0.0.1:54329/status');if(r.ok){storageReady=true;break;}}catch{}
 await new Promise(r=>setTimeout(r,500));
}
if(!storageReady){console.error(docker('logs','--tail','40',prefix+'-storage'));throw new Error('Storage fixture not ready');}
sql(`insert into storage.buckets(id,name,public) values('job-photos','job-photos',false);
grant usage on schema storage to authenticated,service_role;
grant all on storage.objects,storage.buckets to authenticated,service_role;
create policy fixture_objects on storage.objects to authenticated using(bucket_id='job-photos' and exists(select 1 from public.jobs j where j.id::text=split_part(name,'/',1) and j.user_id=auth.uid())) with check(bucket_id='job-photos' and exists(select 1 from public.jobs j where j.id::text=split_part(name,'/',1) and j.user_id=auth.uid()));`);
mkdirSync('work/offline-analysis',{recursive:true});
writeFileSync('work/offline-analysis/provider-fixture.json',JSON.stringify({restURL:'http://127.0.0.1:54328',storageURL:'http://127.0.0.1:54329',token:token('authenticated'),anon:token('anon'),userId:'11111111-1111-4111-8111-111111111111',jobId:'22222222-2222-4222-8222-222222222222'}));
console.log('Isolated PostgreSQL / PostgREST / Supabase Storage fixture ready. No production connection.');
