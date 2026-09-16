-- WAWIS 10.83 — trwała historia unieważnionych lifecycle PUSH.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.push_subscription_lifecycle_tombstones (
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_id uuid not null,
  lifecycle_token text not null,
  invalidated_at timestamptz not null default now(),
  primary key (endpoint, p256dh, auth, user_id, lifecycle_token),
  constraint push_subscription_lifecycle_token_length check (length(lifecycle_token) between 1 and 200)
);
alter table private.push_subscription_lifecycle_tombstones enable row level security;
revoke all on table private.push_subscription_lifecycle_tombstones from public, anon, authenticated;
create index if not exists push_subscription_lifecycle_tombstones_endpoint_idx
  on private.push_subscription_lifecycle_tombstones (endpoint, invalidated_at desc);

create or replace function public.push_subscription_sync_atomic(
  p_user_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_lifecycle_token text,
  p_user_agent text default null, p_device_label text default null
)
returns table (subscription_id uuid, owner_user_id uuid, is_active boolean, last_seen_at timestamptz, ownership_generation bigint, reassigned boolean, reason text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_row public.push_subscriptions%rowtype;
  v_now timestamptz := now();
  v_reassigned boolean := false;
begin
  if p_user_id is null or nullif(btrim(coalesce(p_endpoint, '')), '') is null
     or nullif(btrim(coalesce(p_p256dh, '')), '') is null or nullif(btrim(coalesce(p_auth, '')), '') is null
     or nullif(btrim(coalesce(p_lifecycle_token, '')), '') is null then
    raise exception 'push_invalid_subscription' using errcode = '22023';
  end if;
  if length(p_lifecycle_token) > 200 then raise exception 'push_invalid_lifecycle_token' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_endpoint, 0));
  if exists (
    select 1 from private.push_subscription_lifecycle_tombstones t
    where t.endpoint = p_endpoint and t.p256dh = p_p256dh and t.auth = p_auth
      and t.user_id = p_user_id and t.lifecycle_token = p_lifecycle_token
  ) then raise exception 'push_lifecycle_disabled' using errcode = 'P0001'; end if;
  select ps.* into v_row from public.push_subscriptions ps where ps.endpoint = p_endpoint for update;
  if not found then
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, device_label, is_active, lifecycle_token, ownership_generation, created_at, updated_at, last_seen_at)
    values (p_user_id, p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''),1200), left(coalesce(p_device_label,'Urządzenie'),240), true, p_lifecycle_token, 1, v_now, v_now, v_now)
    returning * into v_row;
    return query select v_row.id,v_row.user_id,v_row.is_active,v_row.last_seen_at,v_row.ownership_generation,false,'created'::text; return;
  end if;
  if v_row.p256dh <> p_p256dh or v_row.auth <> p_auth then raise exception 'push_credentials_mismatch' using errcode='P0001'; end if;
  if v_row.is_active then
    if v_row.user_id=p_user_id and v_row.lifecycle_token=p_lifecycle_token then
      update public.push_subscriptions set user_agent=left(coalesce(p_user_agent,''),1200), device_label=left(coalesce(p_device_label,'Urządzenie'),240), last_seen_at=v_now, updated_at=v_now where id=v_row.id returning * into v_row;
      return query select v_row.id,v_row.user_id,v_row.is_active,v_row.last_seen_at,v_row.ownership_generation,false,'refreshed'::text; return;
    end if;
    if v_row.user_id=p_user_id and v_row.lifecycle_token like 'legacy:%' and p_lifecycle_token not like 'legacy:%' then
      update public.push_subscriptions set lifecycle_token=p_lifecycle_token, ownership_generation=v_row.ownership_generation+1, user_agent=left(coalesce(p_user_agent,''),1200), device_label=left(coalesce(p_device_label,'Urządzenie'),240), last_seen_at=v_now, updated_at=v_now where id=v_row.id returning * into v_row;
      return query select v_row.id,v_row.user_id,v_row.is_active,v_row.last_seen_at,v_row.ownership_generation,false,'upgraded-legacy'::text; return;
    end if;
    raise exception 'push_owner_active' using errcode='P0001';
  end if;
  if v_row.user_id=p_user_id and v_row.lifecycle_token=p_lifecycle_token then raise exception 'push_lifecycle_disabled' using errcode='P0001'; end if;
  v_reassigned := v_row.user_id <> p_user_id;
  update public.push_subscriptions set user_id=p_user_id,lifecycle_token=p_lifecycle_token,ownership_generation=v_row.ownership_generation+1,user_agent=left(coalesce(p_user_agent,''),1200),device_label=left(coalesce(p_device_label,'Urządzenie'),240),is_active=true,last_seen_at=v_now,updated_at=v_now where id=v_row.id returning * into v_row;
  return query select v_row.id,v_row.user_id,v_row.is_active,v_row.last_seen_at,v_row.ownership_generation,v_reassigned,'claimed-inactive'::text;
end;$$;

create or replace function public.push_subscription_disable_atomic(
  p_request_user_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_lifecycle_token text default '',
  p_allow_foreign_cleanup boolean default false, p_allow_legacy_cleanup boolean default false
)
returns table (subscription_id uuid, disabled boolean, ownership_generation bigint, reason text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_row public.push_subscriptions%rowtype;
  v_now timestamptz := now();
  v_token text := btrim(coalesce(p_lifecycle_token,''));
begin
  if p_request_user_id is null or nullif(btrim(coalesce(p_endpoint,'')),'') is null or nullif(btrim(coalesce(p_p256dh,'')),'') is null or nullif(btrim(coalesce(p_auth,'')),'') is null then raise exception 'push_invalid_subscription' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_endpoint,0));
  select ps.* into v_row from public.push_subscriptions ps where ps.endpoint=p_endpoint for update;
  if not found then
    if v_token <> '' then
      insert into private.push_subscription_lifecycle_tombstones(endpoint,p256dh,auth,user_id,lifecycle_token,invalidated_at) values(p_endpoint,p_p256dh,p_auth,p_request_user_id,v_token,v_now) on conflict do nothing;
      insert into public.push_subscriptions(user_id,endpoint,p256dh,auth,is_active,lifecycle_token,ownership_generation,created_at,updated_at,last_seen_at) values(p_request_user_id,p_endpoint,p_p256dh,p_auth,false,v_token,1,v_now,v_now,v_now) returning * into v_row;
      return query select v_row.id,true,v_row.ownership_generation,'tombstone-created'::text; return;
    end if;
    return query select null::uuid,false,0::bigint,'not-found'::text; return;
  end if;
  if v_row.p256dh<>p_p256dh or v_row.auth<>p_auth then raise exception 'push_credentials_mismatch' using errcode='P0001'; end if;
  if v_token='' then
    if not (p_allow_legacy_cleanup and v_row.lifecycle_token like 'legacy:%') then return query select v_row.id,false,v_row.ownership_generation,'stale-lifecycle'::text; return; end if;
  elsif v_row.lifecycle_token<>v_token then return query select v_row.id,false,v_row.ownership_generation,'stale-lifecycle'::text; return;
  end if;
  if v_row.user_id<>p_request_user_id and not p_allow_foreign_cleanup then return query select v_row.id,false,v_row.ownership_generation,'owner-mismatch'::text; return; end if;
  if v_token<>'' then insert into private.push_subscription_lifecycle_tombstones(endpoint,p256dh,auth,user_id,lifecycle_token,invalidated_at) values(p_endpoint,p_p256dh,p_auth,v_row.user_id,v_token,v_now) on conflict do nothing; end if;
  if not v_row.is_active then return query select v_row.id,false,v_row.ownership_generation,'already-disabled'::text; return; end if;
  update public.push_subscriptions set is_active=false, ownership_generation=v_row.ownership_generation+1, updated_at=v_now where id=v_row.id returning * into v_row;
  return query select v_row.id,true,v_row.ownership_generation,'disabled'::text;
end;$$;
revoke all on function public.push_subscription_sync_atomic(uuid,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.push_subscription_disable_atomic(uuid,text,text,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.push_subscription_sync_atomic(uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.push_subscription_disable_atomic(uuid,text,text,text,text,boolean,boolean) to service_role;
