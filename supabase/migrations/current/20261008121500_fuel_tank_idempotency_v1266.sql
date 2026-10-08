-- WAWIS 12.66 / P1-03: idempotent fuel tank delivery and adjustment operations.
alter table public.fuel_tank_movements
  add column if not exists operation_id uuid;

create unique index if not exists fuel_tank_movement_operation_user_uidx
  on public.fuel_tank_movements (created_by, operation_id)
  where operation_id is not null;

create or replace function public.admin_add_fuel_tank_movement_v1266(
  p_movement_type text,
  p_liters numeric,
  p_note text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_type text := lower(pg_catalog.btrim(pg_catalog.coalesce(p_movement_type, '')));
  v_liters numeric(12,2);
  v_note text := pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(p_note, '')), '');
  v_row public.fuel_tank_movements%rowtype;
begin
  if (select auth.uid()) is null or not public.current_user_is_admin() then
    raise exception 'Tylko administrator może dodawać dostawy i korekty zbiornika.' using errcode='42501';
  end if;
  if p_operation_id is null then
    raise exception 'Brakuje identyfikatora operacji dostawy.' using errcode='22023';
  end if;
  if v_type not in ('delivery', 'adjustment') then
    raise exception 'Nieprawidłowy typ ruchu zbiornika.' using errcode='22023';
  end if;
  if p_liters is null or p_liters = 0 or (v_type = 'delivery' and p_liters <= 0) then
    raise exception 'Nieprawidłowa ilość paliwa.' using errcode='22023';
  end if;
  v_liters := pg_catalog.round(p_liters, 2);
  if v_liters = 0 then
    raise exception 'Ilość paliwa jest zbyt mała.' using errcode='22023';
  end if;

  insert into public.fuel_tank_movements (
    movement_type, delta_liters, fuel_entry_id, note, happened_at, created_by, operation_id
  ) values (
    v_type, v_liters, null, v_note, now(), (select auth.uid()), p_operation_id
  )
  on conflict (created_by, operation_id) where operation_id is not null do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row
      from public.fuel_tank_movements
     where created_by = (select auth.uid()) and operation_id = p_operation_id;
    if v_row.id is null then
      raise exception 'Nie udało się potwierdzić dostawy paliwa.' using errcode='P0001';
    end if;
    if v_row.movement_type is distinct from v_type
      or v_row.delta_liters is distinct from v_liters
      or v_row.note is distinct from v_note then
      raise exception 'Identyfikator operacji został użyty z innymi danymi.' using errcode='23505';
    end if;
  end if;
  return pg_catalog.to_jsonb(v_row);
end
$function$;

revoke all on function public.admin_add_fuel_tank_movement_v1266(text,numeric,text,uuid) from public, anon;
grant execute on function public.admin_add_fuel_tank_movement_v1266(text,numeric,text,uuid) to authenticated, service_role;

-- Old direct RPC is unsafe after an uncertain commit. Deploy frontend and switch RPC in one controlled release.
revoke execute on function public.admin_add_fuel_tank_movement(text,numeric,text) from authenticated;
