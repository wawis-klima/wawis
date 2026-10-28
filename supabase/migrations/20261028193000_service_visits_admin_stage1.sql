-- WAWIS: odrębna, bezpieczna ewidencja rzeczywistych wizyt serwisowych.
-- Nie modyfikuje istniejących services, jobs, devices, SMS ani protokołów montażowych.
create table if not exists public.service_visits (
  id uuid primary key default gen_random_uuid(),
  create_operation_id uuid not null unique,
  create_payload_fingerprint text not null,
  contractor_id uuid not null references public.contractors(id),
  scheduled_date date not null,
  scheduled_time time without time zone,
  primary_technician_id uuid references public.profiles(id) on delete set null,
  additional_technician_ids uuid[] not null default '{}',
  notes text not null default '',
  status text not null default 'zaplanowany'
    check (status in ('zaplanowany', 'w_trakcie', 'oczekuje_na_podpis', 'wykonany', 'odwolany')),
  performed_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_visits_notes_length check (length(notes) <= 4000),
  constraint service_visits_completed_has_actual_date
    check (status <> 'wykonany' or (performed_at is not null and completed_at is not null))
);
create index if not exists service_visits_contractor_date_idx on public.service_visits(contractor_id, scheduled_date desc);
create index if not exists service_visits_status_date_idx on public.service_visits(status, scheduled_date);
create index if not exists service_visits_primary_staff_idx on public.service_visits(primary_technician_id);

-- Historia po urządzeniu nie znika wskutek rekonstrukcji urządzenia przez synchronizator montaży.
-- FK device_id ustawia NULL przy usunięciu; device_ref_id i snapshot pozostają bez zmian.
create table if not exists public.service_visit_devices (
  id uuid primary key default gen_random_uuid(),
  service_visit_id uuid not null references public.service_visits(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  device_ref_id uuid not null,
  model_snapshot text not null,
  serial_snapshot text not null,
  installation_date_snapshot date,
  checklist jsonb not null default '{}'::jsonb,
  result text check (result in ('sprawne','usterka')),
  notes text not null default '',
  performed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(service_visit_id, device_ref_id),
  constraint service_visit_device_notes_length check(length(notes) <= 4000),
  constraint service_visit_device_checklist_type check (jsonb_typeof(checklist)='object')
);
create index if not exists service_visit_devices_device_ref_idx on public.service_visit_devices(device_ref_id);
create index if not exists service_visit_devices_visit_idx on public.service_visit_devices(service_visit_id);

create table if not exists public.service_visit_assignment_events (
  id bigint generated always as identity primary key,
  service_visit_id uuid not null references public.service_visits(id) on delete cascade,
  old_primary_technician_id uuid,
  new_primary_technician_id uuid,
  old_additional_technician_ids uuid[] not null default '{}',
  new_additional_technician_ids uuid[] not null default '{}',
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists service_visit_assignment_events_visit_idx
  on public.service_visit_assignment_events(service_visit_id, changed_at);

-- Dokument serwisowy jest niezależny od job_protocols.
create table if not exists public.service_visit_protocols (
  id uuid primary key default gen_random_uuid(),
  service_visit_id uuid not null unique references public.service_visits(id) on delete cascade,
  storage_path text not null,
  signature_path text not null,
  file_name text not null,
  file_size_bytes bigint not null check(file_size_bytes > 0),
  signed_at timestamptz not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  signed_snapshot jsonb not null
);

alter table public.service_visits enable row level security;
alter table public.service_visit_devices enable row level security;
alter table public.service_visit_assignment_events enable row level security;
alter table public.service_visit_protocols enable row level security;

-- Pierwszy etap: TYLKO Administrator. Zwykły pracownik nie widzi nawet listy do podjęcia.
create policy service_visits_admin_all on public.service_visits for all to authenticated
  using ((select public.current_user_is_admin()))
  with check ((select public.current_user_is_admin()));
create policy service_visit_devices_admin_all on public.service_visit_devices for all to authenticated
  using ((select public.current_user_is_admin()))
  with check ((select public.current_user_is_admin()));
create policy service_visit_assignment_events_admin_read on public.service_visit_assignment_events
  for select to authenticated using ((select public.current_user_is_admin()));
create policy service_visit_protocols_admin_all on public.service_visit_protocols for all to authenticated
  using ((select public.current_user_is_admin()))
  with check ((select public.current_user_is_admin()));

revoke all on public.service_visits, public.service_visit_devices,
  public.service_visit_assignment_events, public.service_visit_protocols from anon;
grant select, insert, update, delete on public.service_visits, public.service_visit_devices to authenticated;
grant select on public.service_visit_assignment_events to authenticated;
grant select, insert, update on public.service_visit_protocols to authenticated;
grant usage, select on sequence public.service_visit_assignment_events_id_seq to authenticated;

create or replace function public.service_visit_admin_search(p_query text, p_limit integer default 60)
returns table(
  device_id uuid,
  contractor_id uuid,
  contractor_name text,
  contractor_contact text,
  contractor_city text,
  contractor_street text,
  contractor_phone text,
  contractor_email text,
  model text,
  serial_number text,
  installation_date date
)
language plpgsql security invoker set search_path = ''
as $$
declare q text := lower(btrim(coalesce(p_query,'')));
begin
  if not public.current_user_is_admin() then
    raise exception 'Brak uprawnień administratora';
  end if;
  if length(q) < 2 then return; end if;
  return query
    select d.id,d.contractor_id,c.company_name,c.contact_person,c.city,c.street,c.phone,c.email,
           d.model,d.serial_number,d.installation_date
    from public.devices d join public.contractors c on c.id = d.contractor_id
    where position(q in lower(concat_ws(' ',c.company_name,c.contact_person,c.city,c.street,c.phone,c.email,d.model,d.serial_number,d.notes))) > 0
    order by c.company_name, d.model, d.id
    limit least(greatest(coalesce(p_limit,60),1),100);
end
$$;
revoke all on function public.service_visit_admin_search(text,integer) from public, anon;
grant execute on function public.service_visit_admin_search(text,integer) to authenticated;

-- Tworzy zlecenie tylko na wyraźną decyzję administratora, nigdy z samego wysłania SMS.
-- Weryfikuje, że wszystkie wybrane urządzenia rzeczywiście należą do klienta.
create or replace function public.service_visit_admin_create(
  p_contractor_id uuid,
  p_device_ids uuid[],
  p_scheduled_date date,
  p_scheduled_time time without time zone default null,
  p_notes text default '',
  p_primary_technician_id uuid default null,
  p_operation_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare v_id uuid;
declare v_selected integer;
declare v_fingerprint text;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może umawiać przeglądy';
  end if;
  if p_operation_id is null then raise exception 'Brak identyfikatora bezpiecznego zapisu'; end if;
  if p_contractor_id is null or not exists(select 1 from public.contractors c where c.id=p_contractor_id) then
    raise exception 'Nie znaleziono klienta';
  end if;
  if p_scheduled_date is null then raise exception 'Podaj datę wizyty'; end if;
  if p_device_ids is null or coalesce(array_length(p_device_ids,1),0) = 0 then
    raise exception 'Wybierz przynajmniej jedno urządzenie';
  end if;
  select count(distinct x) into v_selected from unnest(p_device_ids) x where x is not null;
  if v_selected <> coalesce(array_length(p_device_ids,1),0)
    or v_selected <> (select count(*) from public.devices d where d.id=any(p_device_ids) and d.contractor_id=p_contractor_id) then
    raise exception 'Nieprawidłowy wybór urządzeń klienta';
  end if;
  if p_primary_technician_id is not null and not exists(
    select 1 from public.profiles p where p.id=p_primary_technician_id and p.role='Pracownik'
  ) then raise exception 'Nieprawidłowy pracownik'; end if;
  v_fingerprint:=md5(jsonb_build_object(
    'contractor',p_contractor_id,'devices',(select array_agg(x order by x) from unnest(p_device_ids) x),
    'date',p_scheduled_date,'time',p_scheduled_time,
    'notes',left(coalesce(p_notes,''),4000),'technician',p_primary_technician_id
  )::text);
  insert into public.service_visits(create_operation_id,create_payload_fingerprint,contractor_id,scheduled_date,scheduled_time,notes,primary_technician_id,created_by)
  values(p_operation_id,v_fingerprint,p_contractor_id,p_scheduled_date,p_scheduled_time,left(coalesce(p_notes,''),4000),p_primary_technician_id,auth.uid())
  on conflict(create_operation_id) do nothing
  returning id into v_id;
  if v_id is null then
    select v.id into v_id from public.service_visits v
      where v.create_operation_id=p_operation_id and v.create_payload_fingerprint=v_fingerprint;
    if v_id is null then raise exception 'Identyfikator zapisu jest już wykorzystany dla innych danych. Odśwież formularz.'; end if;
    return v_id;
  end if;
  insert into public.service_visit_devices(service_visit_id,device_id,device_ref_id,model_snapshot,serial_snapshot,installation_date_snapshot)
  select v_id,d.id,d.id,d.model,d.serial_number,d.installation_date
    from public.devices d where d.id=any(p_device_ids) and d.contractor_id=p_contractor_id;
  return v_id;
end
$$;
revoke all on function public.service_visit_admin_create(uuid,uuid[],date,time without time zone,text,uuid,uuid) from public, anon;
grant execute on function public.service_visit_admin_create(uuid,uuid[],date,time without time zone,text,uuid,uuid) to authenticated;

create or replace function public.service_visit_assignment_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.current_user_is_admin() then raise exception 'Brak uprawnień do przydziału'; end if;
  new.updated_at := now();
  if old.primary_technician_id is distinct from new.primary_technician_id or
     old.additional_technician_ids is distinct from new.additional_technician_ids then
    insert into public.service_visit_assignment_events(
      service_visit_id,old_primary_technician_id,new_primary_technician_id,
      old_additional_technician_ids,new_additional_technician_ids,changed_by)
    values(old.id,old.primary_technician_id,new.primary_technician_id,
      old.additional_technician_ids,new.additional_technician_ids,auth.uid());
  end if;
  return new;
end
$$;
revoke all on function public.service_visit_assignment_audit() from public, anon, authenticated;
create trigger service_visit_assignment_audit_trigger
  before update on public.service_visits for each row execute function public.service_visit_assignment_audit();

create or replace function public.service_visit_initial_assignment_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.primary_technician_id is not null or cardinality(new.additional_technician_ids) > 0 then
    insert into public.service_visit_assignment_events(
      service_visit_id,old_primary_technician_id,new_primary_technician_id,
      old_additional_technician_ids,new_additional_technician_ids,changed_by
    ) values(new.id,null,new.primary_technician_id,'{}',new.additional_technician_ids,auth.uid());
  end if;
  return new;
end
$$;
revoke all on function public.service_visit_initial_assignment_audit() from public, anon, authenticated;
create trigger service_visit_initial_assignment_audit_trigger
  after insert on public.service_visits for each row execute function public.service_visit_initial_assignment_audit();

comment on table public.service_visits is
  'Faktycznie umówione wizyty serwisowe, niezależne od kolejki SMS. Admin-only na etapie 1.';
