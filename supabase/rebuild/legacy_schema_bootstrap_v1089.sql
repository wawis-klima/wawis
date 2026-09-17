-- WAWIS 10.89 — N7 stage B
-- Canonical pre-migration bootstrap used only for isolated rebuild verification.
-- It restores the schema objects that existed before Supabase migration tracking began.
-- After this bootstrap, the recorded production migrations are replayed/rebased normally.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key,
  full_name text,
  email text unique,
  role text default 'Oczekujący'::text not null,
  created_at timestamptz default now()
);

create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_person text,
  phone text,
  email text,
  city text,
  street text,
  notes text,
  is_active boolean default true not null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null,
  tax_id text,
  nip text,
  addresses jsonb default '[]'::jsonb not null
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text,
  client text,
  location text,
  status text,
  admin_note text,
  created_at timestamp default now(),
  created_by uuid,
  email text,
  phone text,
  main_technician_id uuid,
  city text,
  street text,
  installation_date date,
  sms_consent boolean default false not null,
  sms_reminder_enabled boolean default true not null,
  service_due_date date,
  last_sms_sent_at timestamptz,
  last_sms_status text,
  last_sms_error text,
  sms_recipient_phone text,
  contractor_id uuid,
  device_model text,
  device_serial_number text,
  service_reminder_years integer default 5 not null,
  contractor_address_id text,
  completed_at timestamptz,
  completed_by uuid,
  payment_confirmation_enabled boolean default false not null,
  payment_amount numeric(12,2),
  payment_kind text,
  payment_method text,
  payment_paid_at timestamptz,
  payment_recorded_by uuid,
  payment_updated_at timestamptz
);

create table if not exists public.job_access (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  user_id uuid
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  author_id uuid,
  type text,
  text text,
  created_at timestamp default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  image_url text,
  storage_path text,
  uploaded_by uuid,
  created_at timestamp default now(),
  ocr_status text,
  ocr_checked_at timestamptz,
  photo_kind text default ''::text not null,
  device_index integer default 0 not null,
  unit_ref text default ''::text not null
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid,
  model text default ''::text not null,
  serial_number text not null,
  notes text,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null,
  installation_date date,
  status text default 'aktywne'::text not null,
  source_job_id text,
  source_kind text default 'manual'::text not null,
  service_reminder_years integer default 5 not null
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text,
  body text,
  is_read boolean default false,
  link_job_id uuid,
  created_at timestamptz default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  device_label text,
  is_active boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  last_seen_at timestamptz default now() not null,
  lifecycle_token text not null default gen_random_uuid()::text,
  ownership_generation bigint default 1 not null
);

create table if not exists public.push_delivery_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  job_id uuid,
  type text not null,
  status text not null,
  response_code integer,
  error_message text,
  created_at timestamptz default now() not null
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  client text not null,
  phone text,
  city text,
  street text,
  source_job_id text,
  device_id text,
  model text,
  serial_number text,
  service_due_date date,
  service_date date,
  status text default 'do_kontaktu'::text not null,
  notes text,
  source_kind text default 'manual'::text not null
);

create table if not exists public.sms_settings (
  id uuid primary key default gen_random_uuid(),
  is_enabled boolean default true not null,
  sender_name text,
  service_phone text,
  company_name text,
  template_service_reminder text default 'Dzień dobry {client}, przypominamy o obowiązkowym przeglądzie klimatyzacji po 11 miesiącach od montażu. Aby utrzymać gwarancję, prosimy o kontakt: {service_phone}. {company_name}'::text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  sending_mode text default 'approval'::text not null
);

create table if not exists public.sms_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  client text,
  phone text not null,
  message text not null,
  sms_type text default 'service_reminder'::text not null,
  provider text default 'smsapi'::text not null,
  provider_message_id text,
  status text default 'queued'::text not null,
  planned_for timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  error_message text,
  created_by uuid,
  created_at timestamptz default now() not null,
  approved_at timestamptz,
  approved_by uuid,
  provider_response jsonb,
  reminder_for_date date,
  service_cycle_number integer,
  reminder_cycle integer,
  reminder_due_date date,
  device_id uuid
);

create table if not exists public.nameplate_product_catalog (
  ean text primary key,
  manufacturer text not null,
  family text,
  model_code text,
  model_name text not null,
  capacity_kw numeric(7,2),
  unit_type text default 'unknown'::text not null,
  revision text,
  source_type text default 'manual'::text not null,
  source_reference text,
  verified boolean default false not null,
  created_by uuid,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.nameplate_manual_verifications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  device_index integer not null,
  unit_ref text not null,
  verified_by uuid default auth.uid(),
  verified_at timestamptz default now() not null,
  created_at timestamptz default now() not null,
  unique (job_id, device_index, unit_ref)
);

create table if not exists public.photo_audit_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  photo_id uuid,
  actor_user_id uuid,
  actor_role text,
  action text not null,
  source text default 'app'::text not null,
  storage_path text,
  image_url text,
  details jsonb default '{}'::jsonb not null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);
