-- WAWIS 10.79 — finalny model dostępu do globalnego feedu.
-- RPC działa jako SECURITY INVOKER, a widoczność wymusza RLS: tylko zalogowany staff
-- i tylko wpisy globalne (audience_user_id is null).

begin;

grant select on table public.mobile_change_feed to authenticated;

drop policy if exists mobile_change_feed_staff_global_select on public.mobile_change_feed;
create policy mobile_change_feed_staff_global_select
on public.mobile_change_feed
for select
to authenticated
using (
  audience_user_id is null
  and public.current_user_is_staff()
);

create or replace function public.get_mobile_change_batch(
  p_after_seq bigint default 0,
  p_limit integer default 100
)
returns table (
  change_seq bigint,
  job_id uuid,
  change_kind text,
  changed_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_is_staff() then
    return;
  end if;

  return query
  select f.change_seq, f.job_id, f.change_kind, f.changed_at
  from public.mobile_change_feed f
  where f.change_seq > greatest(coalesce(p_after_seq, 0), 0)
    and f.audience_user_id is null
  order by f.change_seq
  limit least(greatest(coalesce(p_limit, 100), 1), 250);
end;
$$;

create or replace function public.get_mobile_change_head()
returns bigint
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select case
    when public.current_user_is_staff() then coalesce(max(f.change_seq), 0)
    else 0
  end
  from public.mobile_change_feed f
  where f.audience_user_id is null;
$$;

revoke all on function public.get_mobile_change_batch(bigint, integer) from public, anon;
revoke all on function public.get_mobile_change_head() from public, anon;
grant execute on function public.get_mobile_change_batch(bigint, integer) to authenticated, service_role;
grant execute on function public.get_mobile_change_head() to authenticated, service_role;

commit;
