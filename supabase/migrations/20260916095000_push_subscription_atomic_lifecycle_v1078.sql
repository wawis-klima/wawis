-- WAWIS 10.78 — atomowa własność endpointu PUSH i ochrona lifecycle A→B.
-- Cel: serializacja sync/disable dla tego samego endpointu, tombstone po logout,
-- blokada spóźnionego sync/disable oraz generacja własności do weryfikacji w Service Workerze.

alter table public.push_subscriptions
  add column if not exists lifecycle_token text,
  add column if not exists ownership_generation bigint;

update public.push_subscriptions
set lifecycle_token = coalesce(nullif(lifecycle_token, ''), 'legacy:' || user_id::text || ':' || endpoint),
    ownership_generation = coalesce(ownership_generation, 1)
where lifecycle_token is null
   or lifecycle_token = ''
   or ownership_generation is null;

alter table public.push_subscriptions
  alter column lifecycle_token set not null,
  alter column ownership_generation set default 1,
  alter column ownership_generation set not null;

create index if not exists push_subscriptions_user_active_idx
  on public.push_subscriptions (user_id, is_active);

create or replace function public.push_subscription_sync_atomic(
  p_user_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_lifecycle_token text,
  p_user_agent text default null,
  p_device_label text default null
)
returns table (
  subscription_id uuid,
  owner_user_id uuid,
  is_active boolean,
  last_seen_at timestamptz,
  ownership_generation bigint,
  reassigned boolean,
  reason text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.push_subscriptions%rowtype;
  v_now timestamptz := now();
  v_reassigned boolean := false;
begin
  if p_user_id is null
     or nullif(btrim(coalesce(p_endpoint, '')), '') is null
     or nullif(btrim(coalesce(p_p256dh, '')), '') is null
     or nullif(btrim(coalesce(p_auth, '')), '') is null
     or nullif(btrim(coalesce(p_lifecycle_token, '')), '') is null then
    raise exception 'push_invalid_subscription' using errcode = '22023';
  end if;

  if length(p_lifecycle_token) > 200 then
    raise exception 'push_invalid_lifecycle_token' using errcode = '22023';
  end if;

  -- Działa także przy braku rekordu: dwa równoległe pierwsze zapisy tego samego
  -- endpointu nie mogą przejść obok siebie przed UNIQUE(endpoint).
  perform pg_advisory_xact_lock(hashtextextended(p_endpoint, 0));

  select ps.*
    into v_row
  from public.push_subscriptions ps
  where ps.endpoint = p_endpoint
  for update;

  if not found then
    insert into public.push_subscriptions (
      user_id, endpoint, p256dh, auth, user_agent, device_label,
      is_active, lifecycle_token, ownership_generation,
      created_at, updated_at, last_seen_at
    ) values (
      p_user_id, p_endpoint, p_p256dh, p_auth,
      left(coalesce(p_user_agent, ''), 1200),
      left(coalesce(p_device_label, 'Urządzenie'), 240),
      true, p_lifecycle_token, 1,
      v_now, v_now, v_now
    )
    returning * into v_row;

    return query select
      v_row.id, v_row.user_id, v_row.is_active, v_row.last_seen_at,
      v_row.ownership_generation, false, 'created'::text;
    return;
  end if;

  if v_row.p256dh <> p_p256dh or v_row.auth <> p_auth then
    raise exception 'push_credentials_mismatch' using errcode = 'P0001';
  end if;

  if v_row.is_active then
    if v_row.user_id = p_user_id and v_row.lifecycle_token = p_lifecycle_token then
      update public.push_subscriptions
      set user_agent = left(coalesce(p_user_agent, ''), 1200),
          device_label = left(coalesce(p_device_label, 'Urządzenie'), 240),
          last_seen_at = v_now,
          updated_at = v_now
      where id = v_row.id
      returning * into v_row;

      return query select
        v_row.id, v_row.user_id, v_row.is_active, v_row.last_seen_at,
        v_row.ownership_generation, false, 'refreshed'::text;
      return;
    end if;

    -- Jednorazowy upgrade aktywnego rekordu po wdrożeniu 10.78. Tylko ten sam
    -- użytkownik może zastąpić deterministyczny token legacy nowym tokenem v1078.
    if v_row.user_id = p_user_id
       and v_row.lifecycle_token like 'legacy:%'
       and p_lifecycle_token not like 'legacy:%' then
      update public.push_subscriptions
      set lifecycle_token = p_lifecycle_token,
          ownership_generation = v_row.ownership_generation + 1,
          user_agent = left(coalesce(p_user_agent, ''), 1200),
          device_label = left(coalesce(p_device_label, 'Urządzenie'), 240),
          last_seen_at = v_now,
          updated_at = v_now
      where id = v_row.id
      returning * into v_row;

      return query select
        v_row.id, v_row.user_id, v_row.is_active, v_row.last_seen_at,
        v_row.ownership_generation, false, 'upgraded-legacy'::text;
      return;
    end if;

    raise exception 'push_owner_active' using errcode = 'P0001';
  end if;

  -- Ten sam wyłączony lifecycle jest tombstonem po logout. Spóźniony sync
  -- z tego samego requestu nie może ponownie aktywować endpointu.
  if v_row.user_id = p_user_id and v_row.lifecycle_token = p_lifecycle_token then
    raise exception 'push_lifecycle_disabled' using errcode = 'P0001';
  end if;

  v_reassigned := v_row.user_id <> p_user_id;

  update public.push_subscriptions
  set user_id = p_user_id,
      lifecycle_token = p_lifecycle_token,
      ownership_generation = v_row.ownership_generation + 1,
      user_agent = left(coalesce(p_user_agent, ''), 1200),
      device_label = left(coalesce(p_device_label, 'Urządzenie'), 240),
      is_active = true,
      last_seen_at = v_now,
      updated_at = v_now
  where id = v_row.id
  returning * into v_row;

  return query select
    v_row.id, v_row.user_id, v_row.is_active, v_row.last_seen_at,
    v_row.ownership_generation, v_reassigned, 'claimed-inactive'::text;
end;
$$;

create or replace function public.push_subscription_disable_atomic(
  p_request_user_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_lifecycle_token text default '',
  p_allow_foreign_cleanup boolean default false,
  p_allow_legacy_cleanup boolean default false
)
returns table (
  subscription_id uuid,
  disabled boolean,
  ownership_generation bigint,
  reason text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.push_subscriptions%rowtype;
  v_now timestamptz := now();
  v_token text := btrim(coalesce(p_lifecycle_token, ''));
begin
  if p_request_user_id is null
     or nullif(btrim(coalesce(p_endpoint, '')), '') is null
     or nullif(btrim(coalesce(p_p256dh, '')), '') is null
     or nullif(btrim(coalesce(p_auth, '')), '') is null then
    raise exception 'push_invalid_subscription' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_endpoint, 0));

  select ps.*
    into v_row
  from public.push_subscriptions ps
  where ps.endpoint = p_endpoint
  for update;

  if not found then
    -- Tombstone blokuje spóźniony pierwszy sync, który mógł już opuścić klienta,
    -- ale jeszcze nie utworzył rekordu w DB.
    if v_token <> '' then
      insert into public.push_subscriptions (
        user_id, endpoint, p256dh, auth, is_active,
        lifecycle_token, ownership_generation,
        created_at, updated_at, last_seen_at
      ) values (
        p_request_user_id, p_endpoint, p_p256dh, p_auth, false,
        v_token, 1, v_now, v_now, v_now
      )
      returning * into v_row;

      return query select v_row.id, true, v_row.ownership_generation, 'tombstone-created'::text;
      return;
    end if;

    return query select null::uuid, false, 0::bigint, 'not-found'::text;
    return;
  end if;

  if v_row.p256dh <> p_p256dh or v_row.auth <> p_auth then
    raise exception 'push_credentials_mismatch' using errcode = 'P0001';
  end if;

  if v_token = '' then
    if not (p_allow_legacy_cleanup and v_row.lifecycle_token like 'legacy:%') then
      return query select v_row.id, false, v_row.ownership_generation, 'stale-lifecycle'::text;
      return;
    end if;
  elsif v_row.lifecycle_token <> v_token then
    -- Spóźnione disable A po handoffie do B nie może wyłączyć B.
    return query select v_row.id, false, v_row.ownership_generation, 'stale-lifecycle'::text;
    return;
  end if;

  if v_row.user_id <> p_request_user_id and not p_allow_foreign_cleanup then
    return query select v_row.id, false, v_row.ownership_generation, 'owner-mismatch'::text;
    return;
  end if;

  if not v_row.is_active then
    return query select v_row.id, false, v_row.ownership_generation, 'already-disabled'::text;
    return;
  end if;

  update public.push_subscriptions
  set is_active = false,
      ownership_generation = v_row.ownership_generation + 1,
      updated_at = v_now
  where id = v_row.id
  returning * into v_row;

  return query select v_row.id, true, v_row.ownership_generation, 'disabled'::text;
end;
$$;

revoke all on function public.push_subscription_sync_atomic(uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.push_subscription_disable_atomic(uuid, text, text, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.push_subscription_sync_atomic(uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.push_subscription_disable_atomic(uuid, text, text, text, text, boolean, boolean) to service_role;

comment on function public.push_subscription_sync_atomic(uuid, text, text, text, text, text, text)
is 'WAWIS 10.78: atomowy sync właściciela endpointu PUSH, serializowany advisory lockiem.';

comment on function public.push_subscription_disable_atomic(uuid, text, text, text, text, boolean, boolean)
is 'WAWIS 10.78: atomowe wyłączenie/tombstone endpointu PUSH z ochroną lifecycle przed spóźnionymi requestami.';
