-- SMS Etap 5 / v12.22: przywrócenie widoku kolejki i bieżącego miesiąca
-- bez cofania ochrony historii i bez implicit consent dla uszkodzonych powiązań.
-- Legacy devices dostają jawny stan SMS na poziomie urządzenia.

alter table public.devices
  add column if not exists sms_consent boolean not null default true,
  add column if not exists sms_reminder_enabled boolean not null default true;

CREATE OR REPLACE FUNCTION public.admin_list_devices_with_contractor_v2()
 RETURNS TABLE(id uuid, contractor_id uuid, contractor_name text, contractor_city text, contractor_street text, contractor_phone text, contractor_email text, model text, serial_number text, installation_date date, service_reminder_years integer, status text, notes text, source_job_id text, source_kind text, sms_consent boolean, sms_reminder_enabled boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    d.id,
    d.contractor_id,
    coalesce(c.company_name, '') as contractor_name,
    coalesce(c.city, '') as contractor_city,
    coalesce(c.street, '') as contractor_street,
    coalesce(c.phone, '') as contractor_phone,
    coalesce(c.email, '') as contractor_email,
    d.model,
    d.serial_number,
    d.installation_date,
    greatest(1, least(coalesce(d.service_reminder_years, 5), 10)) as service_reminder_years,
    d.status,
    d.notes,
    d.source_job_id,
    d.source_kind,
    d.sms_consent,
    d.sms_reminder_enabled,
    d.created_at,
    d.updated_at
  from public.devices d
  left join public.contractors c on c.id = d.contractor_id
  where public.current_user_is_admin()
  order by d.installation_date desc nulls last, d.created_at desc, d.id desc;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_sms_module_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_settings jsonb;
  v_queue_logs jsonb;
  v_sent_this_month_logs jsonb;
  v_history_logs jsonb;
  v_today date := (current_timestamp at time zone 'Europe/Warsaw')::date;
  v_month_start date;
  v_next_month date;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role'
     and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może odczytywać dane modułu SMS.' using errcode = '42501';
  end if;

  v_month_start := date_trunc('month', v_today::timestamp)::date;
  v_next_month := (v_month_start + interval '1 month')::date;

  select pg_catalog.to_jsonb(s)
    into v_settings
  from (
    select id, is_enabled, sending_mode, sender_name, service_phone, company_name,
           template_service_reminder, updated_at
    from public.sms_settings
    order by updated_at desc nulls last, created_at desc nulls last
    limit 1
  ) s;

  select coalesce(
      pg_catalog.jsonb_agg(pg_catalog.row_to_json(x) order by x.created_at desc),
      '[]'::jsonb
    )
    into v_queue_logs
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
    where l.sms_type = 'service_reminder'
      and (
        lower(btrim(coalesce(l.status, ''))) = 'pending_approval'
        or l.reminder_due_date between (v_today - 62) and v_today
      )
    order by l.created_at desc
  ) x;

  select coalesce(
      pg_catalog.jsonb_agg(pg_catalog.row_to_json(x) order by
        coalesce(x.delivered_at, x.sent_at, x.approved_at, x.created_at) desc),
      '[]'::jsonb
    )
    into v_sent_this_month_logs
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
    where lower(btrim(coalesce(l.status, ''))) in ('sent', 'provider_sent', 'delivered')
      and (coalesce(l.delivered_at, l.sent_at, l.approved_at, l.created_at) at time zone 'Europe/Warsaw')::date >= v_month_start
      and (coalesce(l.delivered_at, l.sent_at, l.approved_at, l.created_at) at time zone 'Europe/Warsaw')::date < v_next_month
  ) x;

  select coalesce(
      pg_catalog.jsonb_agg(pg_catalog.row_to_json(x) order by x.created_at desc),
      '[]'::jsonb
    )
    into v_history_logs
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
    'logs', coalesce(v_queue_logs, '[]'::jsonb),
    'queue_logs', coalesce(v_queue_logs, '[]'::jsonb),
    'sent_this_month_logs', coalesce(v_sent_this_month_logs, '[]'::jsonb),
    'history_logs', coalesce(v_history_logs, '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_service_sms_group_v2(p_log_id uuid, p_job_id uuid, p_device_id uuid, p_cycle integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_log public.sms_log%rowtype;
  v_device public.devices%rowtype;
  v_job public.jobs%rowtype;
  v_contractor public.contractors%rowtype;
  v_source_job uuid;
  v_source_text text;
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
  v_client text;
  v_consent_source text := 'job';
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji wysyłającej.' using errcode = '42501';
  end if;

  if p_cycle is null or p_cycle < 1 or p_cycle > 100 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_cycle');
  end if;

  if p_log_id is not null then
    select * into v_log
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
    select * into v_device
    from public.devices
    where id = v_device_id;

    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_found');
    end if;

    v_installation_date := v_device.installation_date;
    v_source_text := btrim(coalesce(v_device.source_job_id, ''));

    if v_source_text <> '' then
      v_source_job := private.sms_source_job_uuid(v_source_text);

      if v_source_job is null then
        return pg_catalog.jsonb_build_object(
          'ok', false,
          'reason', 'missing_linked_job_consent',
          'message', 'Urządzenie ma nieprawidłowe powiązanie z kartą klienta.'
        );
      end if;

      if v_linked_job is not null and v_linked_job <> v_source_job then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'job_device_mismatch');
      end if;

      v_linked_job := v_source_job;
    else
      if v_linked_job is not null then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'job_device_mismatch');
      end if;

      if v_device.sms_consent is not true or v_device.sms_reminder_enabled is not true then
        return pg_catalog.jsonb_build_object(
          'ok', false,
          'reason', 'sms_disabled',
          'message', 'Zgoda SMS lub przypomnienia dla tego starszego urządzenia są wyłączone.'
        );
      end if;

      if v_device.contractor_id is null then
        return pg_catalog.jsonb_build_object(
          'ok', false,
          'reason', 'missing_legacy_contractor',
          'message', 'Starsze urządzenie nie ma przypisanego kontrahenta.'
        );
      end if;

      select * into v_contractor
      from public.contractors
      where id = v_device.contractor_id;

      if not found then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'contractor_not_found');
      end if;

      v_current_phone := private.normalize_sms_phone(v_contractor.phone);
      if v_current_phone is null then
        return pg_catalog.jsonb_build_object(
          'ok', false,
          'reason', 'invalid_current_phone',
          'message', 'Aktualny numer telefonu klienta nie jest prawidłowym polskim numerem.'
        );
      end if;

      v_client := coalesce(
        nullif(btrim(v_contractor.company_name), ''),
        nullif(btrim(v_contractor.contact_person), ''),
        'Kliencie'
      );
      v_consent_source := 'legacy_device';
    end if;
  end if;

  if v_consent_source = 'job' then
    if v_linked_job is null then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'reason', 'missing_linked_job_consent',
        'message', 'Brak karty klienta z jednoznaczną zgodą SMS.'
      );
    end if;

    select * into v_job
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

    v_current_phone := private.normalize_sms_phone(
      coalesce(nullif(btrim(v_job.sms_recipient_phone), ''), v_job.phone)
    );
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

    v_client := coalesce(
      nullif(btrim(v_job.client), ''),
      nullif(btrim(v_job.title), ''),
      'Kliencie'
    );
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
    select l.id into v_existing_primary
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
      client = v_client,
      reminder_cycle = p_cycle,
      reminder_due_date = v_due_date,
      reminder_group_id = v_group_id,
      reminder_group_primary = true
    where id = p_log_id;
  end if;

  v_delivery_key := 'group:' || v_group_id::text;

  insert into private.sms_delivery_claims(
    delivery_key,
    reminder_group_id,
    source_log_id,
    job_id,
    device_id,
    recipient_phone,
    reminder_cycle,
    reminder_due_date,
    client
  )
  values (
    v_delivery_key,
    v_group_id,
    p_log_id,
    v_linked_job,
    v_device_id,
    v_current_phone,
    p_cycle,
    v_due_date,
    v_client
  )
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
    'client', v_client,
    'cycle', p_cycle,
    'consent_source', v_consent_source
  );
end;
$function$;

revoke all on function public.admin_list_devices_with_contractor_v2() from public;
revoke all on function public.admin_list_devices_with_contractor_v2() from anon;
grant execute on function public.admin_list_devices_with_contractor_v2() to authenticated;
grant execute on function public.admin_list_devices_with_contractor_v2() to service_role;

revoke all on function public.claim_service_sms_group_v2(uuid, uuid, uuid, integer) from public;
revoke all on function public.claim_service_sms_group_v2(uuid, uuid, uuid, integer) from anon;
revoke all on function public.claim_service_sms_group_v2(uuid, uuid, uuid, integer) from authenticated;
grant execute on function public.claim_service_sms_group_v2(uuid, uuid, uuid, integer) to service_role;
