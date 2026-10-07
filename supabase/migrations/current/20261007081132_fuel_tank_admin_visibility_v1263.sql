drop policy if exists fuel_tank_movements_staff_select on public.fuel_tank_movements;
drop policy if exists fuel_tank_movements_admin_select on public.fuel_tank_movements;

create policy fuel_tank_movements_admin_select
on public.fuel_tank_movements
for select
to authenticated
using ((select public.current_user_is_admin()));

create or replace function public.get_fuel_tank_status()
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_status jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może odczytać stan zbiornika paliwa.'
      using errcode='42501';
  end if;

  select pg_catalog.jsonb_build_object(
    'balance_liters', coalesce(sum(m.delta_liters), 0),
    'supplied_liters', coalesce(sum(case when m.delta_liters > 0 then m.delta_liters else 0 end), 0),
    'used_liters', coalesce(sum(case when m.movement_type = 'refuel' then -m.delta_liters else 0 end), 0),
    'tracking_started_at', min(m.happened_at) filter (where m.movement_type = 'opening'),
    'last_movement_at', max(m.happened_at)
  )
  into v_status
  from public.fuel_tank_movements m;

  return coalesce(
    v_status,
    pg_catalog.jsonb_build_object(
      'balance_liters', 0,
      'supplied_liters', 0,
      'used_liters', 0,
      'tracking_started_at', null,
      'last_movement_at', null
    )
  );
end
$function$;

alter function public.get_fuel_tank_status() owner to postgres;
revoke all on function public.get_fuel_tank_status() from public, anon;
grant execute on function public.get_fuel_tank_status() to authenticated, service_role;
