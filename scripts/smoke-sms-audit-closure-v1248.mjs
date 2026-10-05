import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const callbackMigration = fs.readFileSync(new URL('../supabase/migrations/20261005133000_sms_callback_auth_rotation_v1246.sql', import.meta.url), 'utf8');
const historyMigration = fs.readFileSync(new URL('../supabase/migrations/20261005134000_sms_group_device_history_v1247.sql', import.meta.url), 'utf8');

{
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create schema private; create schema extensions; create sequence extensions.token_seq;" +
    "create function auth.jwt() returns jsonb language sql stable as $$select '{\"role\":\"service_role\"}'::jsonb$$;" +
    "create function extensions.gen_random_bytes(p_len integer) returns bytea language plpgsql volatile as $$ declare v text; begin v:=nextval('extensions.token_seq')::text; return decode(substr(md5(v)||md5(v||':2'),1,p_len*2),'hex'); end $$;");
  await db.exec(callbackMigration);
  const first = (await db.query('select public.get_smsapi_callback_auth_tokens() as x')).rows[0].x;
  assert.match(first.current, /^[0-9a-f]{64}$/);
  assert.equal(first.previous, null);
  const rotated = (await db.query('select public.rotate_smsapi_callback_auth_token(60) as x')).rows[0].x;
  assert.equal(rotated.ok, true);
  assert.notEqual(rotated.current, first.current);
  const second = (await db.query('select public.get_smsapi_callback_auth_tokens() as x')).rows[0].x;
  assert.equal(second.current, rotated.current);
  assert.equal(second.previous, first.current);
  await db.close();
}

{
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create schema private;" +
    "create function auth.jwt() returns jsonb language sql stable as $$select '{\"role\":\"service_role\"}'::jsonb$$;" +
    "create function public.current_user_is_admin() returns boolean language sql stable as $$select true$$;" +
    "create function private.sms_source_job_uuid(p text) returns uuid language plpgsql immutable as $$ declare x text:=split_part(trim(coalesce(p,'')),'::',1); begin if x~*'^[0-9a-f-]{36}$' then return x::uuid; end if; return null; end $$;" +
    "create function private.normalize_sms_phone(p text) returns text language sql immutable as $$ select nullif(regexp_replace(coalesce(p,''),'\\D','','g'),'') $$;" +
    "create function private.service_sms_due_date(p_date date,p_cycle integer) returns date language sql immutable as $$ select (p_date + ((11+((p_cycle-1)*12))::text||' months')::interval)::date $$;" +
    "create table public.contractors(id uuid primary key,phone text);" +
    "create table public.jobs(id uuid primary key,phone text,sms_recipient_phone text,service_reminder_years integer);" +
    "create table public.devices(id uuid primary key,contractor_id uuid,source_job_id text,installation_date date,service_reminder_years integer);" +
    "create table private.sms_reminder_groups(id uuid primary key,normalized_phone text not null,anchor_due_date date not null,window_end_date date not null);" +
    "create table public.sms_log(id uuid primary key,job_id uuid,device_id uuid,client text,phone text,status text,error_message text,created_at timestamptz,planned_for timestamptz,approved_at timestamptz,sent_at timestamptz,delivered_at timestamptz,reminder_cycle integer,reminder_due_date date,reminder_group_id uuid);");
  await db.exec(historyMigration);
  const jobA='10000000-0000-4000-8000-000000000001';
  const jobB='10000000-0000-4000-8000-000000000002';
  const deviceA='20000000-0000-4000-8000-000000000001';
  const deviceB='20000000-0000-4000-8000-000000000002';
  const group='30000000-0000-4000-8000-000000000001';
  const log='40000000-0000-4000-8000-000000000001';
  await db.exec("insert into public.jobs(id,phone,sms_recipient_phone,service_reminder_years) values('"+jobA+"','500111222','500111222',1),('"+jobB+"','500111222','500111222',1);" +
    "insert into public.devices(id,source_job_id,installation_date,service_reminder_years) values('"+deviceA+"','"+jobA+"::device-1','2025-11-05',1),('"+deviceB+"','"+jobB+"::device-1','2025-11-05',1);" +
    "insert into private.sms_reminder_groups(id,normalized_phone,anchor_due_date,window_end_date) values('"+group+"','500111222','2026-10-05','2026-12-06');" +
    "insert into public.sms_log(id,job_id,device_id,client,phone,status,created_at,sent_at,reminder_cycle,reminder_due_date,reminder_group_id) values('"+log+"','"+jobB+"','"+deviceB+"','Klient grupowy','500111222','delivered',now(),now(),1,'2026-10-05','"+group+"');");
  const history = await db.query('select * from public.admin_get_device_sms_history($1,$2)', [deviceA, jobA]);
  assert.equal(history.rows.length, 1);
  assert.equal(history.rows[0].id, log);
  assert.equal(history.rows[0].device_id, deviceB);
  await db.close();
}

console.log('PASS: SMS audit closure — callback token rotation and group-aware device history');
