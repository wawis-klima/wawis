-- Moduł SMS etap 1: struktura bazy pod przypomnienia serwisowe.

alter table public.jobs
  add column if not exists sms_consent boolean not null default false,
  add column if not exists sms_reminder_enabled boolean not null default true,
  add column if not exists service_due_date date,
  add column if not exists last_sms_sent_at timestamptz,
  add column if not exists last_sms_status text,
  add column if not exists last_sms_error text,
  add column if not exists sms_recipient_phone text;

create or replace function public.calculate_service_due_date(installation_date date)
returns date
language sql
immutable
as $$
  select case
    when installation_date is null then null
    else (installation_date + interval '11 months')::date
  end;
$$;

create or replace function public.set_job_service_due_date()
returns trigger
language plpgsql
as $$
begin
  new.service_due_date := public.calculate_service_due_date(new.installation_date);
  if coalesce(new.sms_recipient_phone, '') = '' then
    new.sms_recipient_phone := new.phone;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_job_service_due_date on public.jobs;
create trigger trg_set_job_service_due_date
before insert or update of installation_date, phone, sms_recipient_phone
on public.jobs
for each row
execute function public.set_job_service_due_date();

update public.jobs
set
  service_due_date = public.calculate_service_due_date(installation_date),
  sms_recipient_phone = coalesce(nullif(sms_recipient_phone, ''), phone)
where true;

create table if not exists public.sms_settings (
  id uuid primary key default gen_random_uuid(),
  is_enabled boolean not null default true,
  sender_name text,
  service_phone text,
  company_name text,
  template_service_reminder text not null default 'Dzień dobry {client}, przypominamy o obowiązkowym przeglądzie klimatyzacji po 11 miesiącach od montażu. Aby utrzymać gwarancję, prosimy o kontakt: {service_phone}. {company_name}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sms_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete cascade,
  client text,
  phone text not null,
  message text not null,
  sms_type text not null default 'service_reminder',
  provider text not null default 'smsapi',
  provider_message_id text,
  status text not null default 'queued',
  planned_for timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  error_message text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

insert into public.sms_settings (is_enabled, sender_name, service_phone, company_name)
select true, null, null, 'Wawis Klimatyzacja'
where not exists (select 1 from public.sms_settings);

grant select, insert, update, delete
  on table public.sms_settings, public.sms_log
  to service_role;

grant usage, select
  on all sequences in schema public
  to service_role;

alter table public.sms_settings enable row level security;
alter table public.sms_log enable row level security;

drop policy if exists "sms_settings_admin_select" on public.sms_settings;
create policy "sms_settings_admin_select"
on public.sms_settings
for select
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'Administrator'
  )
);

drop policy if exists "sms_settings_admin_insert" on public.sms_settings;
create policy "sms_settings_admin_insert"
on public.sms_settings
for insert
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'Administrator'
  )
);

drop policy if exists "sms_settings_admin_update" on public.sms_settings;
create policy "sms_settings_admin_update"
on public.sms_settings
for update
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'Administrator'
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'Administrator'
  )
);

drop policy if exists "sms_log_admin_select" on public.sms_log;
create policy "sms_log_admin_select"
on public.sms_log
for select
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'Administrator'
  )
);

drop policy if exists "sms_log_admin_insert" on public.sms_log;
create policy "sms_log_admin_insert"
on public.sms_log
for insert
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'Administrator'
  )
);

drop policy if exists "jobs_admin_update_sms_columns" on public.jobs;
create policy "jobs_admin_update_sms_columns"
on public.jobs
for update
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'Administrator'
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'Administrator'
  )
);
