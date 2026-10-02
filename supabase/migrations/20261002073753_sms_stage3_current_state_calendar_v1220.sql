alter table public.jobs
  alter column sms_consent set default true,
  alter column sms_reminder_enabled set default true;

create or replace function private.normalize_sms_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_raw text := btrim(coalesce(p_phone, ''));
  v_digits text;
begin
  if v_raw = '' then return null; end if;

  if v_raw !~ '^[0-9+()[:space:].-]+$' then
    return null;
  end if;

  v_digits := pg_catalog.regexp_replace(v_raw, '\D', '', 'g');

  if pg_catalog.length(v_digits) = 13 and v_digits like '0048%' then
    v_digits := pg_catalog.substr(v_digits, 3);
  elsif pg_catalog.length(v_digits) = 9 then
    v_digits := '48' || v_digits;
  end if;

  if pg_catalog.length(v_digits) <> 11 or v_digits not like '48%' then
    return null;
  end if;

  return v_digits;
end;
$$;

revoke all on function private.normalize_sms_phone(text) from public;
revoke all on function private.normalize_sms_phone(text) from anon;
revoke all on function private.normalize_sms_phone(text) from authenticated;

create or replace function private.sms_source_job_uuid(p_source_job_id text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_source text;
begin
  v_source := pg_catalog.split_part(btrim(coalesce(p_source_job_id, '')), '::', 1);
  if v_source ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_source::uuid;
  end if;
  return null;
end;
$$;

revoke all on function private.sms_source_job_uuid(text) from public;
revoke all on function private.sms_source_job_uuid(text) from anon;
revoke all on function private.sms_source_job_uuid(text) from authenticated;

create or replace function private.service_sms_due_date(
  p_installation_date date,
  p_cycle integer
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_months integer;
  v_target_month date;
  v_last_day integer;
  v_day integer;
begin
  if p_installation_date is null or p_cycle is null or p_cycle < 1 or p_cycle > 100 then
    return null;
  end if;

  v_months := 11 + ((p_cycle - 1) * 12);
  v_target_month := (pg_catalog.date_trunc('month', p_installation_date::timestamp) + pg_catalog.make_interval(months => v_months))::date;
  v_last_day := extract(day from (v_target_month + interval '1 month - 1 day'))::integer;
  v_day := least(extract(day from p_installation_date)::integer, v_last_day);

  return pg_catalog.make_date(
    extract(year from v_target_month)::integer,
    extract(month from v_target_month)::integer,
    v_day
  );
end;
$$;

revoke all on function private.service_sms_due_date(date, integer) from public;
revoke all on function private.service_sms_due_date(date, integer) from anon;
revoke all on function private.service_sms_due_date(date, integer) from authenticated;

create or replace function public.claim_service_sms_group_v2(
  p_log_id uuid,
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
  v_log public.sms_log%rowtype;
  v_device public.devices%rowtype;
  v_job public.jobs%rowtype;
  v_source_job uuid;
  v_linked_job uuid;
  v_device_id uuid := p_device_id;
  v_current_phone text;
  v_installation_date date;
  v_due_date date;
  v_today date;
  v_group_id uuid;
  v_existing_primary uuid;
  v_claim_id uuid;
  v_delivery_key text;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji wysyłającej.' using errcode = '42501';
  end if;

  if p_cycle is null or p_cycle < 1 or p_cycle > 100 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_cycle');
  end if;

  if p_log_id is not null then
    select *
      into v_log
    from public.sms_log
    where id = p_log_id
    for update;

    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'log_not_found');
    end if;

    if lower(btrim(coalesce(v_log.status, ''))) <> 'pending_approval'
       or v_log.provider_message_id is not null
       or v_log.sent_at is not null
       or v_log.delivered_at is not null then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'log_not_pending');
    end if;

    if v_device_id is null then v_device_id := v_log.device_id; end if;
    if p_job_id is null then v_linked_job := v_log.job_id; else v_linked_job := p_job_id; end if;
  else
    v_linked_job := p_job_id;
  end if;

  if v_device_id is not null then
    select *
      into v_device
    from public.devices
    where id = v_device_id;

    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_found');
    end if;

    v_source_job := private.sms_source_job_uuid(v_device.source_job_id);

    if v_source_job is null then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'reason', 'missing_linked_job_consent',
        'message', 'Urządzenie nie ma pewnego powiązania z kartą klienta i zgodą SMS.'
      );
    end if;

    if v_linked_job is not null and v_linked_job <> v_source_job then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'job_device_mismatch');
    end if;

    v_linked_job := v_source_job;
    v_installation_date := v_device.installation_date;
  end if;

  if v_linked_job is null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'missing_linked_job_consent',
      'message', 'Brak karty klienta z jednoznaczną zgodą SMS.'
    );
  end if;

  select *
    into v_job
  from public.jobs
  where id = v_linked_job;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'job_not_found');
  end if;

  if v_job.sms_consent is not true or v_job.sms_reminder_enabled is not true then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'sms_disabled',
      'message', 'Zgoda SMS lub przypomnienia są obecnie wyłączone.'
    );
  end if;

  v_current_phone := private.normalize_sms_phone(coalesce(nullif(btrim(v_job.sms_recipient_phone), ''), v_job.phone));
  if v_current_phone is null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'invalid_current_phone',
      'message', 'Aktualny numer telefonu klienta nie jest prawidłowym polskim numerem.'
    );
  end if;

  if v_installation_date is null then
    v_installation_date := v_job.installation_date;
  end if;

  v_due_date := private.service_sms_due_date(v_installation_date, p_cycle);
  if v_due_date is null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'missing_installation_date');
  end if;

  v_today := (current_timestamp at time zone 'Europe/Warsaw')::date;

  if v_today < v_due_date or v_today > v_due_date + 62 then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'outside_active_window',
      'current_due_date', v_due_date,
      'window_end_date', v_due_date + 62,
      'today_warsaw', v_today
    );
  end if;

  v_group_id := private.ensure_sms_reminder_group(v_current_phone, v_due_date);

  if exists (
    select 1
    from public.sms_log l
    where l.reminder_group_id = v_group_id
      and (
        lower(btrim(coalesce(l.status, ''))) in ('sent', 'provider_sent', 'delivered')
        or l.provider_message_id is not null
      )
      and (p_log_id is null or l.id <> p_log_id)
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'group_already_sent',
      'reminder_group_id', v_group_id
    );
  end if;

  if p_log_id is not null then
    select l.id
      into v_existing_primary
    from public.sms_log l
    where l.reminder_group_id = v_group_id
      and l.reminder_group_primary
      and l.id <> p_log_id
    order by l.created_at desc
    limit 1;

    if v_existing_primary is not null then
      if v_log.reminder_group_id is distinct from v_group_id then
        update public.sms_log
        set
          status = 'deleted',
          reminder_group_primary = false,
          error_message = 'Pozycja zastąpiona aktualną grupą klienta po zmianie danych.'
        where id = p_log_id;
      end if;

      return pg_catalog.jsonb_build_object(
        'ok', false,
        'reason', 'group_already_has_primary',
        'reminder_group_id', v_group_id,
        'primary_log_id', v_existing_primary
      );
    end if;

    update public.sms_log
    set
      job_id = v_linked_job,
      device_id = v_device_id,
      phone = v_current_phone,
      reminder_cycle = p_cycle,
      reminder_due_date = v_due_date,
      reminder_group_id = v_group_id,
      reminder_group_primary = true
    where id = p_log_id;
  end if;

  v_delivery_key := 'group:' || v_group_id::text;

  insert into private.sms_delivery_claims(delivery_key)
  values (v_delivery_key)
  on conflict do nothing
  returning claim_id into v_claim_id;

  if v_claim_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'group_claim_exists',
      'reminder_group_id', v_group_id
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'claim_id', v_claim_id,
    'reminder_group_id', v_group_id,
    'recipient_phone', v_current_phone,
    'current_due_date', v_due_date,
    'window_end_date', v_due_date + 62,
    'linked_job_id', v_linked_job,
    'device_id', v_device_id,
    'installation_date', v_installation_date,
    'client', coalesce(nullif(btrim(v_job.client), ''), nullif(btrim(v_job.title), ''), 'Kliencie'),
    'cycle', p_cycle
  );
end;
$$;

revoke all on function public.claim_service_sms_group_v2(uuid, uuid, uuid, integer) from public;
revoke all on function public.claim_service_sms_group_v2(uuid, uuid, uuid, integer) from anon;
revoke all on function public.claim_service_sms_group_v2(uuid, uuid, uuid, integer) from authenticated;
grant execute on function public.claim_service_sms_group_v2(uuid, uuid, uuid, integer) to service_role;
