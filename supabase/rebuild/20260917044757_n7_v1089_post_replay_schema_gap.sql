-- WAWIS 10.89 / N7 stage B / post-replay schema reconcile.
-- REBUILD ONLY. This file is replayed only in an isolated rebuild after the tracked production migrations.

alter table public.fuel_entries
  add column if not exists corrected_by uuid,
  add column if not exists corrected_at timestamptz,
  add column if not exists correction_count integer not null default 0,
  add column if not exists original_liters numeric(7,2),
  add column if not exists original_odometer_km integer;

alter table public.fuel_vehicles
  add column if not exists last_fueled_at timestamptz,
  add column if not exists tank_capacity_liters numeric(6,2);

create table if not exists public.job_protocol_email_log (
  id uuid not null default gen_random_uuid(),
  request_key uuid not null,
  job_id uuid not null,
  protocol_id uuid not null,
  recipient_email text not null,
  sender_email text not null default 'biuro@wawis.pl'::text,
  provider text not null default 'resend'::text,
  provider_message_id text,
  provider_response jsonb,
  status text not null default 'sending'::text,
  error_message text,
  sent_by uuid,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname='fuel_entries_corrected_by_fkey' and conrelid='public.fuel_entries'::regclass) then
    alter table public.fuel_entries add constraint fuel_entries_corrected_by_fkey foreign key (corrected_by) references public.profiles(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='fuel_entries_correction_count_nonnegative' and conrelid='public.fuel_entries'::regclass) then
    alter table public.fuel_entries add constraint fuel_entries_correction_count_nonnegative check (correction_count >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='fuel_vehicles_tank_capacity_range' and conrelid='public.fuel_vehicles'::regclass) then
    alter table public.fuel_vehicles add constraint fuel_vehicles_tank_capacity_range check (tank_capacity_liters is null or (tank_capacity_liters > 0 and tank_capacity_liters <= 500));
  end if;

  if not exists (select 1 from pg_constraint where conname='job_protocol_email_log_pkey' and conrelid='public.job_protocol_email_log'::regclass) then
    alter table public.job_protocol_email_log add constraint job_protocol_email_log_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname='job_protocol_email_log_request_key_key' and conrelid='public.job_protocol_email_log'::regclass) then
    alter table public.job_protocol_email_log add constraint job_protocol_email_log_request_key_key unique (request_key);
  end if;
  if not exists (select 1 from pg_constraint where conname='job_protocol_email_log_recipient_check' and conrelid='public.job_protocol_email_log'::regclass) then
    alter table public.job_protocol_email_log add constraint job_protocol_email_log_recipient_check check (recipient_email = lower(recipient_email) and length(recipient_email) between 3 and 254);
  end if;
  if not exists (select 1 from pg_constraint where conname='job_protocol_email_log_sender_check' and conrelid='public.job_protocol_email_log'::regclass) then
    alter table public.job_protocol_email_log add constraint job_protocol_email_log_sender_check check (sender_email = 'biuro@wawis.pl'::text);
  end if;
  if not exists (select 1 from pg_constraint where conname='job_protocol_email_log_status_check' and conrelid='public.job_protocol_email_log'::regclass) then
    alter table public.job_protocol_email_log add constraint job_protocol_email_log_status_check check (status = any (array['sending'::text,'sent'::text,'failed'::text]));
  end if;
  if not exists (select 1 from pg_constraint where conname='job_protocol_email_log_job_id_fkey' and conrelid='public.job_protocol_email_log'::regclass) then
    alter table public.job_protocol_email_log add constraint job_protocol_email_log_job_id_fkey foreign key (job_id) references public.jobs(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='job_protocol_email_log_protocol_id_fkey' and conrelid='public.job_protocol_email_log'::regclass) then
    alter table public.job_protocol_email_log add constraint job_protocol_email_log_protocol_id_fkey foreign key (protocol_id) references public.job_protocols(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='job_protocol_email_log_sent_by_fkey' and conrelid='public.job_protocol_email_log'::regclass) then
    alter table public.job_protocol_email_log add constraint job_protocol_email_log_sent_by_fkey foreign key (sent_by) references public.profiles(id) on delete set null;
  end if;
end $$;
