create table private.sms_reminder_groups (
  id uuid primary key default gen_random_uuid(),
  customer_key text not null,
  normalized_phone text not null,
  anchor_due_date date not null,
  window_end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sms_reminder_groups_window_check
    check (window_end_date = anchor_due_date + 62)
);

create unique index sms_reminder_groups_customer_anchor_uidx
  on private.sms_reminder_groups(customer_key, anchor_due_date);
create index sms_reminder_groups_customer_window_idx
  on private.sms_reminder_groups(customer_key, window_end_date);

alter table private.sms_reminder_groups enable row level security;
revoke all on table private.sms_reminder_groups from public;
revoke all on table private.sms_reminder_groups from anon;
revoke all on table private.sms_reminder_groups from authenticated;

alter table public.sms_log
  add column reminder_group_id uuid null,
  add column reminder_group_primary boolean not null default false;

alter table public.sms_log
  add constraint sms_log_reminder_group_id_fkey
  foreign key (reminder_group_id)
  references private.sms_reminder_groups(id)
  on delete restrict;

create index idx_sms_log_reminder_group_id
  on public.sms_log(reminder_group_id);

create or replace function private.normalize_sms_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_digits text;
begin
  v_digits := pg_catalog.regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if v_digits = '' then return null; end if;
  if pg_catalog.length(v_digits) = 9 then return '48' || v_digits; end if;
  if pg_catalog.length(v_digits) = 11 and v_digits like '48%' then return v_digits; end if;
  return v_digits;
end;
$$;

revoke all on function private.normalize_sms_phone(text) from public;
revoke all on function private.normalize_sms_phone(text) from anon;
revoke all on function private.normalize_sms_phone(text) from authenticated;

with recursive normalized as (
  select l.id, private.normalize_sms_phone(l.phone) as normalized_phone, l.reminder_due_date
  from public.sms_log l
  where l.sms_type = 'service_reminder'
    and l.reminder_due_date is not null
    and private.normalize_sms_phone(l.phone) is not null
),
due_dates as (
  select distinct
    'phone:' || normalized_phone as customer_key,
    normalized_phone,
    reminder_due_date as due_date
  from normalized
),
ordered as (
  select
    customer_key,
    normalized_phone,
    due_date,
    row_number() over (partition by customer_key order by due_date) as rn
  from due_dates
),
clustered as (
  select customer_key, normalized_phone, due_date, rn, due_date as anchor_due_date
  from ordered
  where rn = 1
  union all
  select
    o.customer_key,
    o.normalized_phone,
    o.due_date,
    o.rn,
    case when o.due_date <= c.anchor_due_date + 62 then c.anchor_due_date else o.due_date end
  from clustered c
  join ordered o on o.customer_key = c.customer_key and o.rn = c.rn + 1
)
insert into private.sms_reminder_groups (
  customer_key, normalized_phone, anchor_due_date, window_end_date
)
select distinct customer_key, normalized_phone, anchor_due_date, anchor_due_date + 62
from clustered;

with recursive normalized as (
  select l.id, private.normalize_sms_phone(l.phone) as normalized_phone, l.reminder_due_date
  from public.sms_log l
  where l.sms_type = 'service_reminder'
    and l.reminder_due_date is not null
    and private.normalize_sms_phone(l.phone) is not null
),
due_dates as (
  select distinct
    'phone:' || normalized_phone as customer_key,
    normalized_phone,
    reminder_due_date as due_date
  from normalized
),
ordered as (
  select
    customer_key,
    normalized_phone,
    due_date,
    row_number() over (partition by customer_key order by due_date) as rn
  from due_dates
),
clustered as (
  select customer_key, normalized_phone, due_date, rn, due_date as anchor_due_date
  from ordered
  where rn = 1
  union all
  select
    o.customer_key,
    o.normalized_phone,
    o.due_date,
    o.rn,
    case when o.due_date <= c.anchor_due_date + 62 then c.anchor_due_date else o.due_date end
  from clustered c
  join ordered o on o.customer_key = c.customer_key and o.rn = c.rn + 1
)
update public.sms_log l
set reminder_group_id = g.id
from normalized n
join clustered c
  on c.normalized_phone = n.normalized_phone
 and c.due_date = n.reminder_due_date
join private.sms_reminder_groups g
  on g.customer_key = c.customer_key
 and g.anchor_due_date = c.anchor_due_date
where l.id = n.id;

with ranked as (
  select
    l.id,
    row_number() over (
      partition by l.reminder_group_id
      order by
        case lower(btrim(coalesce(l.status, '')))
          when 'delivered' then 1
          when 'provider_sent' then 2
          when 'sent' then 3
          when 'pending_approval' then 4
          when 'approved' then 5
          when 'error' then 6
          when 'not_sent' then 7
          when 'deleted' then 8
          else 9
        end,
        l.reminder_due_date asc nulls last,
        coalesce(l.delivered_at, l.sent_at, l.approved_at, l.created_at) desc,
        l.id
    ) as rn
  from public.sms_log l
  where l.reminder_group_id is not null
)
update public.sms_log l
set reminder_group_primary = (r.rn = 1)
from ranked r
where l.id = r.id;

create unique index uq_sms_log_reminder_group_primary
  on public.sms_log(reminder_group_id)
  where reminder_group_id is not null and reminder_group_primary;

create or replace function private.ensure_sms_reminder_group(p_phone text, p_due_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_customer_key text;
  v_group_id uuid;
  v_future_group_id uuid;
  v_max_due date;
begin
  v_phone := private.normalize_sms_phone(p_phone);
  if v_phone is null then
    raise exception 'Brak numeru telefonu dla grupy SMS.';
  end if;
  if p_due_date is null then
    raise exception 'Brak terminu przypomnienia dla grupy SMS.';
  end if;

  v_customer_key := 'phone:' || v_phone;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_customer_key, 0));

  select g.id
    into v_group_id
  from private.sms_reminder_groups g
  where g.customer_key = v_customer_key
    and p_due_date between g.anchor_due_date and g.window_end_date
  order by g.anchor_due_date
  limit 1;

  if v_group_id is not null then
    return v_group_id;
  end if;

  select g.id
    into v_future_group_id
  from private.sms_reminder_groups g
  where g.customer_key = v_customer_key
    and g.anchor_due_date > p_due_date
    and g.anchor_due_date <= p_due_date + 62
  order by g.anchor_due_date
  limit 1;

  if v_future_group_id is not null then
    select max(l.reminder_due_date)
      into v_max_due
    from public.sms_log l
    where l.reminder_group_id = v_future_group_id
      and l.reminder_due_date is not null;

    if v_max_due is null or v_max_due <= p_due_date + 62 then
      update private.sms_reminder_groups
      set anchor_due_date = p_due_date,
          window_end_date = p_due_date + 62,
          updated_at = now()
      where id = v_future_group_id;
      return v_future_group_id;
    end if;
  end if;

  insert into private.sms_reminder_groups (
    customer_key, normalized_phone, anchor_due_date, window_end_date
  )
  values (v_customer_key, v_phone, p_due_date, p_due_date + 62)
  returning id into v_group_id;

  return v_group_id;
end;
$$;

revoke all on function private.ensure_sms_reminder_group(text, date) from public;
revoke all on function private.ensure_sms_reminder_group(text, date) from anon;
revoke all on function private.ensure_sms_reminder_group(text, date) from authenticated;

create or replace function public.ensure_service_sms_group(p_phone text, p_due_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji serwerowej SMS.' using errcode = '42501';
  end if;
  return private.ensure_sms_reminder_group(p_phone, p_due_date);
end;
$$;

revoke all on function public.ensure_service_sms_group(text, date) from public;
revoke all on function public.ensure_service_sms_group(text, date) from anon;
revoke all on function public.ensure_service_sms_group(text, date) from authenticated;
grant execute on function public.ensure_service_sms_group(text, date) to service_role;

create or replace function public.claim_service_sms_group(
  p_phone text,
  p_due_date date,
  p_job_id uuid,
  p_device_id uuid,
  p_cycle integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linked_job uuid := p_job_id;
  v_source text;
  v_job public.jobs%rowtype;
  v_group_id uuid;
  v_claim_id uuid;
  v_delivery_key text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji wysyłającej.' using errcode = '42501';
  end if;

  if p_cycle is null or p_cycle < 1 or p_cycle > 100 then
    raise exception 'Niepoprawny cykl przypomnienia.';
  end if;

  if p_device_id is not null then
    select pg_catalog.split_part(d.source_job_id, '::', 1)
      into v_source
    from public.devices d
    where d.id = p_device_id;

    if not found then
      raise exception 'Urządzenie nie istnieje.';
    end if;

    if v_source ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      if v_linked_job is not null and v_linked_job <> v_source::uuid then
        raise exception 'Niezgodne powiązanie karty i urządzenia.';
      end if;
      v_linked_job := v_source::uuid;
    end if;
  end if;

  if v_linked_job is not null then
    select *
      into v_job
    from public.jobs
    where id = v_linked_job;

    if not found then
      raise exception 'Karta nie istnieje.';
    end if;

    if not v_job.sms_consent or not v_job.sms_reminder_enabled then
      raise exception 'Zgoda SMS lub przypomnienia są wyłączone dla tej karty.';
    end if;
  elsif p_device_id is null then
    raise exception 'Brak karty lub urządzenia do wysyłki.';
  end if;

  v_group_id := private.ensure_sms_reminder_group(p_phone, p_due_date);

  if exists (
    select 1
    from public.sms_log l
    where l.reminder_group_id = v_group_id
      and (
        lower(btrim(coalesce(l.status, ''))) in ('sent', 'provider_sent', 'delivered')
        or l.provider_message_id is not null
      )
  ) then
    return null;
  end if;

  v_delivery_key := 'group:' || v_group_id::text;

  insert into private.sms_delivery_claims(delivery_key)
  values (v_delivery_key)
  on conflict do nothing
  returning claim_id into v_claim_id;

  if v_claim_id is null then
    return null;
  end if;

  return pg_catalog.jsonb_build_object(
    'claim_id', v_claim_id,
    'reminder_group_id', v_group_id
  );
end;
$$;

revoke all on function public.claim_service_sms_group(text, date, uuid, uuid, integer) from public;
revoke all on function public.claim_service_sms_group(text, date, uuid, uuid, integer) from anon;
revoke all on function public.claim_service_sms_group(text, date, uuid, uuid, integer) from authenticated;
grant execute on function public.claim_service_sms_group(text, date, uuid, uuid, integer) to service_role;

create or replace function public.cancel_service_sms_log(
  p_log_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log public.sms_log%rowtype;
  v_status text;
  v_cycle integer;
  v_source_job text;
  v_linked_job uuid;
  v_group_delivery_key text;
  v_legacy_delivery_key text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji serwerowej SMS.'
      using errcode = '42501';
  end if;

  if p_log_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'cancelled', false, 'reason', 'missing_log_id');
  end if;

  select *
    into v_log
  from public.sms_log
  where id = p_log_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'cancelled', false, 'reason', 'not_found');
  end if;

  v_status := lower(btrim(coalesce(v_log.status, '')));
  v_cycle := coalesce(v_log.reminder_cycle, 1);

  if v_status = 'deleted' then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'cancelled', false,
      'already_deleted', true,
      'log_id', v_log.id
    );
  end if;

  if v_status not in ('pending_approval', 'not_sent')
     or v_log.provider_message_id is not null
     or v_log.sent_at is not null
     or v_log.delivered_at is not null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'cancelled', false,
      'reason', 'send_already_started_or_finalized',
      'status', v_log.status,
      'log_id', v_log.id
    );
  end if;

  v_linked_job := v_log.job_id;

  if v_log.device_id is not null then
    select pg_catalog.split_part(d.source_job_id, '::', 1)
      into v_source_job
    from public.devices d
    where d.id = v_log.device_id;

    if v_source_job ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and v_linked_job is null then
      v_linked_job := v_source_job::uuid;
    end if;
  end if;

  if v_log.reminder_group_id is not null then
    v_group_delivery_key := 'group:' || v_log.reminder_group_id::text;
  end if;

  if v_linked_job is not null then
    v_legacy_delivery_key := 'job:' || v_linked_job::text || ':cycle:' || v_cycle::text;
  elsif v_log.device_id is not null then
    v_legacy_delivery_key := 'device:' || v_log.device_id::text || ':cycle:' || v_cycle::text;
  end if;

  if exists (
    select 1
    from private.sms_delivery_claims c
    where (v_group_delivery_key is not null and c.delivery_key = v_group_delivery_key)
       or (v_legacy_delivery_key is not null and c.delivery_key = v_legacy_delivery_key)
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'cancelled', false,
      'reason', 'send_claim_exists',
      'log_id', v_log.id
    );
  end if;

  update public.sms_log
  set
    status = 'deleted',
    approved_at = now(),
    approved_by = p_actor_id,
    error_message = null
  where id = v_log.id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'cancelled', true,
    'log_id', v_log.id,
    'job_id', v_linked_job,
    'device_id', v_log.device_id,
    'reminder_cycle', v_cycle,
    'reminder_group_id', v_log.reminder_group_id
  );
end;
$$;

revoke all on function public.cancel_service_sms_log(uuid, uuid) from public;
revoke all on function public.cancel_service_sms_log(uuid, uuid) from anon;
revoke all on function public.cancel_service_sms_log(uuid, uuid) from authenticated;
grant execute on function public.cancel_service_sms_log(uuid, uuid) to service_role;

create or replace function public.admin_get_sms_module_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings jsonb;
  v_logs jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może odczytywać dane modułu SMS.' using errcode = '42501';
  end if;

  select pg_catalog.to_jsonb(s)
    into v_settings
  from (
    select id, is_enabled, sending_mode, sender_name, service_phone, company_name, template_service_reminder, updated_at
    from public.sms_settings
    order by updated_at desc nulls last, created_at desc nulls last
    limit 1
  ) s;

  select coalesce(
      pg_catalog.jsonb_agg(pg_catalog.row_to_json(x) order by x.created_at desc),
      '[]'::jsonb
    )
    into v_logs
  from (
    select
      l.id,
      l.job_id,
      l.device_id,
      l.client,
      l.phone,
      l.sms_type,
      l.provider,
      l.provider_message_id,
      l.status,
      l.planned_for,
      l.approved_at,
      l.sent_at,
      l.delivered_at,
      l.error_message,
      l.reminder_cycle,
      l.reminder_due_date,
      l.reminder_group_id,
      l.reminder_group_primary,
      g.anchor_due_date as reminder_group_anchor_date,
      g.window_end_date as reminder_group_window_end_date,
      l.created_at
    from public.sms_log l
    left join private.sms_reminder_groups g on g.id = l.reminder_group_id
    order by l.created_at desc
    limit 300
  ) x;

  return pg_catalog.jsonb_build_object(
    'settings', coalesce(v_settings, '{}'::jsonb),
    'logs', coalesce(v_logs, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_get_sms_module_snapshot() from public;
revoke all on function public.admin_get_sms_module_snapshot() from anon;
grant execute on function public.admin_get_sms_module_snapshot() to authenticated;
grant execute on function public.admin_get_sms_module_snapshot() to service_role;
