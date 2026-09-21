-- WAWIS 10.87 — controlled PUSH mutation API + atomic expired cleanup.
create or replace function public.push_subscription_sync_self(
  p_endpoint text, p_p256dh text, p_auth text, p_lifecycle_token text,
  p_user_agent text default null, p_device_label text default null
)
returns table (subscription_id uuid, owner_user_id uuid, is_active boolean, last_seen_at timestamptz, ownership_generation bigint, reassigned boolean, reason text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'push_auth_required' using errcode='42501'; end if;
  return query select * from public.push_subscription_sync_atomic(
    v_user_id, p_endpoint, p_p256dh, p_auth, p_lifecycle_token, p_user_agent, p_device_label
  );
end;$$;

create or replace function public.push_subscription_disable_self(
  p_endpoint text, p_p256dh text, p_auth text, p_lifecycle_token text
)
returns table (subscription_id uuid, disabled boolean, ownership_generation bigint, reason text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'push_auth_required' using errcode='42501'; end if;
  return query select * from public.push_subscription_disable_atomic(
    v_user_id, p_endpoint, p_p256dh, p_auth, p_lifecycle_token, false, false
  );
end;$$;

create or replace function public.push_subscription_expire_atomic(
  p_request_user_id uuid, p_endpoint text, p_p256dh text, p_auth text,
  p_lifecycle_token text, p_expected_generation bigint
)
returns table (subscription_id uuid, disabled boolean, ownership_generation bigint, reason text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.push_subscriptions%rowtype;
  v_now timestamptz := now();
  v_token text := btrim(coalesce(p_lifecycle_token,''));
begin
  if p_request_user_id is null or nullif(btrim(coalesce(p_endpoint,'')),'') is null
     or nullif(btrim(coalesce(p_p256dh,'')),'') is null or nullif(btrim(coalesce(p_auth,'')),'') is null
     or v_token = '' or coalesce(p_expected_generation,0) <= 0 then
    raise exception 'push_invalid_expire_request' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_endpoint,0));
  select ps.* into v_row from public.push_subscriptions ps where ps.endpoint=p_endpoint for update;
  if not found then return query select null::uuid,false,0::bigint,'not-found'::text; return; end if;
  if v_row.user_id <> p_request_user_id then return query select v_row.id,false,v_row.ownership_generation,'owner-mismatch'::text; return; end if;
  if v_row.p256dh <> p_p256dh or v_row.auth <> p_auth then return query select v_row.id,false,v_row.ownership_generation,'credentials-mismatch'::text; return; end if;
  if v_row.lifecycle_token <> v_token then return query select v_row.id,false,v_row.ownership_generation,'stale-lifecycle'::text; return; end if;
  if v_row.ownership_generation <> p_expected_generation then return query select v_row.id,false,v_row.ownership_generation,'generation-mismatch'::text; return; end if;
  if not v_row.is_active then return query select v_row.id,false,v_row.ownership_generation,'already-disabled'::text; return; end if;

  insert into private.push_subscription_lifecycle_tombstones(endpoint,p256dh,auth,user_id,lifecycle_token,invalidated_at)
  values(v_row.endpoint,v_row.p256dh,v_row.auth,v_row.user_id,v_row.lifecycle_token,v_now)
  on conflict do nothing;

  update public.push_subscriptions
  set is_active=false, ownership_generation=v_row.ownership_generation+1, updated_at=v_now
  where id=v_row.id returning * into v_row;
  return query select v_row.id,true,v_row.ownership_generation,'expired-disabled'::text;
end;$$;

revoke all on function public.push_subscription_sync_self(text,text,text,text,text,text) from public,anon;
revoke all on function public.push_subscription_disable_self(text,text,text,text) from public,anon;
revoke all on function public.push_subscription_expire_atomic(uuid,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.push_subscription_sync_self(text,text,text,text,text,text) to authenticated;
grant execute on function public.push_subscription_disable_self(text,text,text,text) to authenticated;
grant execute on function public.push_subscription_expire_atomic(uuid,text,text,text,text,bigint) to service_role;
