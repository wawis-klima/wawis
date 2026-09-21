create extension if not exists pgcrypto;

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid references public.contractors(id) on delete set null,
  source_job_id text,
  source_kind text not null default 'job',
  model text not null default '',
  serial_number text not null default '',
  installation_date date,
  status text not null default 'aktywne',
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.devices
  add column if not exists contractor_id uuid references public.contractors(id) on delete set null,
  add column if not exists source_job_id text,
  add column if not exists source_kind text not null default 'job',
  add column if not exists model text not null default '',
  add column if not exists serial_number text not null default '',
  add column if not exists installation_date date,
  add column if not exists status text not null default 'aktywne',
  add column if not exists notes text not null default '',
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists devices_source_job_id_key
  on public.devices (source_job_id)
  where source_job_id is not null;

create index if not exists devices_contractor_id_idx on public.devices (contractor_id);
create index if not exists devices_status_idx on public.devices (status);
create index if not exists devices_installation_date_idx on public.devices (installation_date);
create index if not exists devices_serial_number_idx on public.devices (serial_number);

alter table public.devices
  drop constraint if exists devices_status_check;

alter table public.devices
  add constraint devices_status_check
  check (status in ('aktywne', 'do_serwisu', 'zdemontowane'));

create or replace function public.touch_devices_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists devices_set_updated_at on public.devices;
create trigger devices_set_updated_at
before update on public.devices
for each row
execute function public.touch_devices_updated_at();

alter table public.devices enable row level security;

drop policy if exists "devices_admin_select" on public.devices;
create policy "devices_admin_select"
on public.devices
for select
using (public.current_user_is_admin());

drop policy if exists "devices_admin_insert" on public.devices;
create policy "devices_admin_insert"
on public.devices
for insert
with check (public.current_user_is_admin());

drop policy if exists "devices_admin_update" on public.devices;
create policy "devices_admin_update"
on public.devices
for update
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "devices_admin_delete" on public.devices;
create policy "devices_admin_delete"
on public.devices
for delete
using (public.current_user_is_admin());

create or replace function public.admin_list_devices_with_contractor()
returns table (
  id uuid,
  contractor_id uuid,
  contractor_name text,
  contractor_city text,
  contractor_street text,
  contractor_phone text,
  contractor_email text,
  model text,
  serial_number text,
  installation_date date,
  status text,
  notes text,
  source_job_id text,
  source_kind text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    d.id,
    d.contractor_id,
    coalesce(c.company_name, '') as contractor_name,
    coalesce(c.city, '') as contractor_city,
    coalesce(c.street, '') as contractor_street,
    coalesce(c.phone, '') as contractor_phone,
    coalesce(c.email, '') as contractor_email,
    d.model,
    d.serial_number,
    d.installation_date,
    d.status,
    d.notes,
    d.source_job_id,
    d.source_kind,
    d.created_at,
    d.updated_at
  from public.devices d
  left join public.contractors c on c.id = d.contractor_id
  where public.current_user_is_admin()
  order by d.installation_date desc nulls last, d.created_at desc, d.id desc;
$$;

create or replace function public.admin_get_contractor_devices(p_contractor_id uuid)
returns table (
  id uuid,
  contractor_id uuid,
  model text,
  serial_number text,
  installation_date date,
  status text,
  notes text,
  source_job_id text,
  source_kind text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    d.id,
    d.contractor_id,
    d.model,
    d.serial_number,
    d.installation_date,
    d.status,
    d.notes,
    d.source_job_id,
    d.source_kind,
    d.created_at,
    d.updated_at
  from public.devices d
  where public.current_user_is_admin()
    and d.contractor_id = p_contractor_id
  order by d.installation_date desc nulls last, d.created_at desc, d.id desc;
$$;

create or replace function public.admin_upsert_device(
  p_id uuid default null,
  p_contractor_id uuid default null,
  p_model text default '',
  p_serial_number text default '',
  p_installation_date date default null,
  p_status text default 'aktywne',
  p_notes text default '',
  p_source_job_id text default null,
  p_source_kind text default 'manual'
)
returns public.devices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.devices;
  v_status text;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może zapisywać urządzenia.';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), 'aktywne');
  if v_status not in ('aktywne', 'do_serwisu', 'zdemontowane') then
    raise exception 'Nieprawidłowy status urządzenia.';
  end if;

  if p_id is null then
    insert into public.devices (
      contractor_id,
      model,
      serial_number,
      installation_date,
      status,
      notes,
      source_job_id,
      source_kind
    )
    values (
      p_contractor_id,
      trim(coalesce(p_model, '')),
      trim(coalesce(p_serial_number, '')),
      p_installation_date,
      v_status,
      coalesce(p_notes, ''),
      nullif(trim(coalesce(p_source_job_id, '')), ''),
      coalesce(nullif(trim(coalesce(p_source_kind, '')), ''), 'manual')
    )
    returning * into v_row;
  else
    update public.devices
    set
      contractor_id = p_contractor_id,
      model = trim(coalesce(p_model, '')),
      serial_number = trim(coalesce(p_serial_number, '')),
      installation_date = p_installation_date,
      status = v_status,
      notes = coalesce(p_notes, ''),
      source_job_id = nullif(trim(coalesce(p_source_job_id, '')), ''),
      source_kind = coalesce(nullif(trim(coalesce(p_source_kind, '')), ''), source_kind)
    where id = p_id
    returning * into v_row;

    if v_row is null then
      raise exception 'Nie znaleziono urządzenia do edycji.';
    end if;
  end if;

  return v_row;
end;
$$;

create or replace function public.admin_update_device_status(p_id uuid, p_status text)
returns public.devices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.devices;
  v_status text;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może zmieniać status urządzenia.';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), 'aktywne');
  if v_status not in ('aktywne', 'do_serwisu', 'zdemontowane') then
    raise exception 'Nieprawidłowy status urządzenia.';
  end if;

  update public.devices
  set status = v_status,
      updated_at = timezone('utc', now())
  where id = p_id
  returning * into v_row;

  if v_row is null then
    raise exception 'Nie znaleziono urządzenia.';
  end if;

  return v_row;
end;
$$;

create or replace function public.admin_delete_device(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może usuwać urządzenia.';
  end if;

  delete from public.devices where id = p_id;
end;
$$;

create or replace function public.sync_device_from_job_row(
  p_job_id text,
  p_contractor_id uuid,
  p_model text,
  p_serial_number text,
  p_installation_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_model), '') = '' and coalesce(trim(p_serial_number), '') = '' then
    delete from public.devices where source_job_id = p_job_id;
    return;
  end if;

  insert into public.devices (
    contractor_id,
    source_job_id,
    source_kind,
    model,
    serial_number,
    installation_date
  )
  values (
    p_contractor_id,
    p_job_id,
    'job',
    trim(coalesce(p_model, '')),
    trim(coalesce(p_serial_number, '')),
    p_installation_date
  )
  on conflict (source_job_id) do update
  set contractor_id = excluded.contractor_id,
      model = excluded.model,
      serial_number = excluded.serial_number,
      installation_date = excluded.installation_date,
      source_kind = 'job',
      updated_at = timezone('utc', now());
end;
$$;

create or replace function public.admin_sync_devices_from_jobs()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_processed integer := 0;
  v_deleted integer := 0;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może synchronizować urządzenia.';
  end if;

  insert into public.devices (
    contractor_id,
    source_job_id,
    source_kind,
    model,
    serial_number,
    installation_date
  )
  select
    j.contractor_id,
    j.id::text,
    'job',
    trim(coalesce(j.device_model, '')),
    trim(coalesce(j.device_serial_number, '')),
    j.installation_date
  from public.jobs j
  where coalesce(trim(j.device_model), '') <> ''
     or coalesce(trim(j.device_serial_number), '') <> ''
  on conflict (source_job_id) do update
  set contractor_id = excluded.contractor_id,
      model = excluded.model,
      serial_number = excluded.serial_number,
      installation_date = excluded.installation_date,
      source_kind = 'job',
      updated_at = timezone('utc', now());

  get diagnostics v_processed = row_count;

  delete from public.devices d
  where d.source_kind = 'job'
    and not exists (
      select 1
      from public.jobs j
      where j.id::text = d.source_job_id
        and (
          coalesce(trim(j.device_model), '') <> ''
          or coalesce(trim(j.device_serial_number), '') <> ''
        )
    );

  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'processed', v_processed,
    'deleted', v_deleted
  );
end;
$$;

create or replace function public.sync_device_from_job_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.devices where source_job_id = old.id::text;
    return old;
  end if;

  perform public.sync_device_from_job_row(
    new.id::text,
    new.contractor_id,
    new.device_model,
    new.device_serial_number,
    new.installation_date
  );

  return new;
end;
$$;

drop trigger if exists jobs_sync_device_after_change on public.jobs;
create trigger jobs_sync_device_after_change
after insert or update of contractor_id, device_model, device_serial_number, installation_date or delete on public.jobs
for each row
execute function public.sync_device_from_job_trigger();

grant select, insert, update, delete on public.devices to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on function public.admin_list_devices_with_contractor() to authenticated;
grant execute on function public.admin_get_contractor_devices(uuid) to authenticated;
grant execute on function public.admin_upsert_device(uuid, uuid, text, text, date, text, text, text, text) to authenticated;
grant execute on function public.admin_update_device_status(uuid, text) to authenticated;
grant execute on function public.admin_delete_device(uuid) to authenticated;
grant execute on function public.admin_sync_devices_from_jobs() to authenticated;
grant execute on function public.sync_device_from_job_row(text, uuid, text, text, date) to authenticated;

select public.admin_sync_devices_from_jobs();
