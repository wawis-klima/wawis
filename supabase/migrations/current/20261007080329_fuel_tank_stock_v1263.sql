create schema if not exists private;

create table if not exists public.fuel_tank_movements (
  id uuid primary key default gen_random_uuid(),
  movement_type text not null,
  delta_liters numeric(12,2) not null,
  fuel_entry_id uuid unique references public.fuel_entries(id) on delete cascade,
  note text,
  happened_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint fuel_tank_movements_type_chk
    check (movement_type in ('opening','delivery','refuel','adjustment')),
  constraint fuel_tank_movements_delta_chk
    check (delta_liters <> 0),
  constraint fuel_tank_movements_shape_chk
    check (
      (movement_type in ('opening','delivery') and delta_liters > 0 and fuel_entry_id is null)
      or (movement_type = 'adjustment' and fuel_entry_id is null)
      or (movement_type = 'refuel' and delta_liters < 0 and fuel_entry_id is not null)
    )
);

create unique index if not exists fuel_tank_opening_singleton_uidx
  on public.fuel_tank_movements (movement_type)
  where movement_type = 'opening';

create index if not exists fuel_tank_movements_happened_at_idx
  on public.fuel_tank_movements (happened_at desc, id desc);

alter table public.fuel_tank_movements enable row level security;

revoke all on table public.fuel_tank_movements from public, anon;
grant select, insert on table public.fuel_tank_movements to authenticated, service_role;

drop policy if exists fuel_tank_movements_staff_select on public.fuel_tank_movements;
create policy fuel_tank_movements_staff_select
on public.fuel_tank_movements
for select
to authenticated
using ((select public.current_user_is_staff()));

drop policy if exists fuel_tank_movements_admin_insert on public.fuel_tank_movements;
create policy fuel_tank_movements_admin_insert
on public.fuel_tank_movements
for insert
to authenticated
with check (
  (select public.current_user_is_admin())
  and movement_type in ('delivery','adjustment')
  and fuel_entry_id is null
  and created_by = (select auth.uid())
);

insert into public.fuel_tank_movements(
  movement_type, delta_liters, fuel_entry_id, note, happened_at, created_by
)
select
  'opening',
  5000.00,
  null,
  'Stan początkowy zbiornika — dostawa 5000 l',
  timestamptz '2026-10-07 09:57:00+02',
  null
where not exists (
  select 1 from public.fuel_tank_movements where movement_type = 'opening'
);

insert into public.fuel_tank_movements(
  movement_type, delta_liters, fuel_entry_id, note, happened_at, created_by
)
select
  'refuel',
  -abs(e.liters),
  e.id,
  'Tankowanie pojazdu',
  e.fueled_at,
  e.created_by
from public.fuel_entries e
where e.fueled_at >= timestamptz '2026-10-07 09:57:00+02'
on conflict (fuel_entry_id) do update
set delta_liters = excluded.delta_liters,
    happened_at = excluded.happened_at,
    created_by = excluded.created_by;

create or replace function private.sync_fuel_tank_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_started_at timestamptz;
begin
  select m.happened_at
    into v_started_at
    from public.fuel_tank_movements m
   where m.movement_type = 'opening'
   order by m.happened_at asc
   limit 1;

  if v_started_at is null then
    return new;
  end if;

  if new.fueled_at < v_started_at then
    delete from public.fuel_tank_movements
     where fuel_entry_id = new.id;
    return new;
  end if;

  insert into public.fuel_tank_movements(
    movement_type, delta_liters, fuel_entry_id, note, happened_at, created_by
  )
  values(
    'refuel',
    -abs(new.liters),
    new.id,
    'Tankowanie pojazdu',
    new.fueled_at,
    new.created_by
  )
  on conflict (fuel_entry_id) do update
  set delta_liters = excluded.delta_liters,
      happened_at = excluded.happened_at,
      created_by = excluded.created_by;

  return new;
end
$function$;

alter function private.sync_fuel_tank_movement() owner to postgres;
revoke all on function private.sync_fuel_tank_movement() from public, anon, authenticated;

drop trigger if exists sync_fuel_tank_movement_after_write on public.fuel_entries;
create trigger sync_fuel_tank_movement_after_write
after insert or update of liters, fueled_at, created_by
on public.fuel_entries
for each row
execute function private.sync_fuel_tank_movement();

create or replace function public.get_fuel_tank_status()
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'balance_liters', coalesce(sum(m.delta_liters), 0),
    'supplied_liters', coalesce(sum(case when m.delta_liters > 0 then m.delta_liters else 0 end), 0),
    'used_liters', coalesce(sum(case when m.movement_type = 'refuel' then -m.delta_liters else 0 end), 0),
    'tracking_started_at', min(m.happened_at) filter (where m.movement_type = 'opening'),
    'last_movement_at', max(m.happened_at)
  )
  from public.fuel_tank_movements m;
$function$;

alter function public.get_fuel_tank_status() owner to postgres;
revoke all on function public.get_fuel_tank_status() from public, anon;
grant execute on function public.get_fuel_tank_status() to authenticated, service_role;

create or replace function public.admin_add_fuel_tank_movement(
  p_movement_type text,
  p_liters numeric,
  p_note text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_type text := lower(trim(coalesce(p_movement_type, '')));
  v_liters numeric(12,2);
  v_row public.fuel_tank_movements%rowtype;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może dodawać dostawy i korekty zbiornika.'
      using errcode='42501';
  end if;

  if v_type not in ('delivery','adjustment') then
    raise exception 'Nieprawidłowy typ ruchu zbiornika.' using errcode='22023';
  end if;

  if p_liters is null or p_liters = 0 then
    raise exception 'Ilość paliwa musi być różna od zera.' using errcode='22023';
  end if;

  if v_type = 'delivery' and p_liters <= 0 then
    raise exception 'Dostawa paliwa musi być większa od 0 litrów.' using errcode='22023';
  end if;

  v_liters := round(p_liters::numeric, 2);

  insert into public.fuel_tank_movements(
    movement_type, delta_liters, fuel_entry_id, note, happened_at, created_by
  )
  values(
    v_type,
    v_liters,
    null,
    nullif(trim(coalesce(p_note,'')), ''),
    now(),
    auth.uid()
  )
  returning * into v_row;

  return pg_catalog.to_jsonb(v_row);
end
$function$;

alter function public.admin_add_fuel_tank_movement(text,numeric,text) owner to postgres;
revoke all on function public.admin_add_fuel_tank_movement(text,numeric,text) from public, anon;
grant execute on function public.admin_add_fuel_tank_movement(text,numeric,text) to authenticated, service_role;
