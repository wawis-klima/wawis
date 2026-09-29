-- WAWIS 11.78 — K21: kompletny, spójnie uporządkowany snapshot katalogu kontrahentów.
-- Jedna wartość JSONB omija limit liczby wierszy PostgREST, który wcześniej wymuszał
-- mieszanie admin_list_contractors z offsetowym SELECT-em.

begin;

create or replace function public.admin_get_contractors_catalog()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception 'Brak uprawnień administratora';
  end if;

  select jsonb_build_object(
    'generated_at', timezone('utc', now()),
    'total', count(*),
    'items', coalesce(
      jsonb_agg(
        to_jsonb(c)
        order by lower(c.company_name), c.created_at desc, c.id
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.contractors c;

  return v_result;
end;
$function$;

revoke all on function public.admin_get_contractors_catalog() from public;
revoke all on function public.admin_get_contractors_catalog() from anon;
grant execute on function public.admin_get_contractors_catalog() to authenticated;
grant execute on function public.admin_get_contractors_catalog() to service_role;

commit;
