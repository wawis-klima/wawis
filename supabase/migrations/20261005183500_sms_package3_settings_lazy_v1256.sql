-- SMS Package 3 / v12.56
-- Lightweight settings-only read for Szablony/Ustawienia SMS.

create or replace function public.admin_get_sms_settings()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_settings jsonb;
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role'
     and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może odczytywać ustawienia modułu SMS.'
      using errcode='42501';
  end if;

  select pg_catalog.to_jsonb(s)
  into v_settings
  from (
    select id,is_enabled,sending_mode,sender_name,service_phone,company_name,
           template_service_reminder,updated_at
    from public.sms_settings
    order by updated_at desc nulls last,created_at desc nulls last
    limit 1
  ) s;

  return coalesce(v_settings,'{}'::jsonb);
end;
$function$;

revoke all on function public.admin_get_sms_settings() from public,anon;
grant execute on function public.admin_get_sms_settings() to authenticated,service_role;
