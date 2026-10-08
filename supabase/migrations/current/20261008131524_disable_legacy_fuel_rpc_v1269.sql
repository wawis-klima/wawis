-- WAWIS 12.69 — close the legacy fuel-tank RPC that lacks operation_id.
-- The current frontend has used admin_add_fuel_tank_movement_v1266 since v12.66.
-- Only the legacy, non-idempotent entrypoint is disabled; history is never altered.
revoke execute on function public.admin_add_fuel_tank_movement(text, numeric, text)
  from public, anon, authenticated, service_role;
comment on function public.admin_add_fuel_tank_movement(text,numeric,text) is
  'LEGACY DISABLED v12.69: use admin_add_fuel_tank_movement_v1266 with required operation_id; historical function retained for controlled rollback.';
