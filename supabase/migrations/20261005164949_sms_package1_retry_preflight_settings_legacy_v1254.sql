-- SMS Package 1 / v12.54
-- P1-02, P1-03, P1-04, P1-05 (Edge fail-closed), N-05.

create or replace function private.sms_log_is_retryable_failure(
  p_status text,p_provider_message_id text,p_sent_at timestamptz,p_delivered_at timestamptz
)
returns boolean
language sql
immutable
set search_path to ''
as $function$
  select case lower(btrim(coalesce(p_status,'')))
    when 'not_sent' then
      p_provider_message_id is null and p_sent_at is null and p_delivered_at is null
    when 'error' then
      p_delivered_at is null
      and (
        nullif(btrim(coalesce(p_provider_message_id,'')),'') is not null
        or p_sent_at is null
      )
    else false
  end;
$function$;

revoke all on function private.sms_log_is_retryable_failure(text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function private.sms_log_is_retryable_failure(text,text,timestamptz,timestamptz) to service_role;

create or replace function public.release_service_sms_claim_before_provider(
  p_claim_id uuid,p_error text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c private.sms_delivery_claims%rowtype;
  l public.sms_log%rowtype;
  v_log_id uuid;
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji wysyłającej.' using errcode='42501';
  end if;

  select * into c from private.sms_delivery_claims where claim_id=p_claim_id for update;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','claim_not_found'); end if;

  if c.provider_message_id is not null or c.confirmed_at is not null or c.uncertain_at is not null then
    return pg_catalog.jsonb_build_object('ok',false,'reason','claim_may_have_reached_provider');
  end if;

  if c.retry_of_log_id is null then
    if c.source_log_id is not null then
      select * into l from public.sms_log where id=c.source_log_id for update;
    end if;

    if l.id is null and c.reminder_group_id is not null then
      select * into l from public.sms_log
      where reminder_group_id=c.reminder_group_id and reminder_group_primary
      order by created_at desc limit 1 for update;
    end if;

    if l.id is not null then
      if l.provider_message_id is not null or l.sent_at is not null or l.delivered_at is not null then
        return pg_catalog.jsonb_build_object('ok',false,'reason','log_has_provider_proof','log_id',l.id);
      end if;

      update public.sms_log
      set job_id=coalesce(c.job_id,job_id),
          device_id=coalesce(c.device_id,device_id),
          client=coalesce(c.client,client),
          phone=coalesce(c.recipient_phone,phone),
          message=coalesce(nullif(c.message,''),message),
          status='not_sent',
          planned_for=coalesce(planned_for,c.claimed_at),
          approved_at=coalesce(approved_at,c.staged_at),
          approved_by=coalesce(approved_by,c.approved_by),
          error_message=nullif(btrim(coalesce(p_error,'')),''),
          reminder_cycle=coalesce(c.reminder_cycle,reminder_cycle),
          reminder_due_date=coalesce(c.reminder_due_date,reminder_due_date),
          reminder_group_id=coalesce(c.reminder_group_id,reminder_group_id),
          reminder_group_primary=true
      where id=l.id
      returning id into v_log_id;
    elsif nullif(btrim(coalesce(c.message,'')),'') is not null
      and nullif(btrim(coalesce(c.recipient_phone,'')),'') is not null then
      insert into public.sms_log(
        job_id,device_id,client,phone,message,sms_type,provider,status,
        planned_for,approved_at,approved_by,created_by,error_message,
        reminder_cycle,reminder_due_date,reminder_group_id,reminder_group_primary
      )
      values(
        c.job_id,c.device_id,c.client,c.recipient_phone,c.message,
        'service_reminder','smsapi','not_sent',c.claimed_at,c.staged_at,
        c.approved_by,c.approved_by,nullif(btrim(coalesce(p_error,'')),''),
        c.reminder_cycle,c.reminder_due_date,c.reminder_group_id,true
      )
      returning id into v_log_id;
    end if;
  end if;

  delete from private.sms_delivery_claims where claim_id=p_claim_id;

  return pg_catalog.jsonb_build_object(
    'ok',true,'released',true,'claim_id',p_claim_id,
    'log_id',v_log_id,'retry_of_log_id',c.retry_of_log_id
  );
end;
$function$;

revoke all on function public.release_service_sms_claim_before_provider(uuid,text) from public,anon,authenticated;
grant execute on function public.release_service_sms_claim_before_provider(uuid,text) to service_role;

alter table private.sms_callback_auth_config
  add column if not exists legacy_claim_cutoff timestamptz,
  add column if not exists legacy_fallback_valid_until timestamptz;

update private.sms_callback_auth_config
set legacy_claim_cutoff=coalesce(legacy_claim_cutoff,timestamptz '2026-10-05 16:45:00+00'),
    legacy_fallback_valid_until=coalesce(legacy_fallback_valid_until,timestamptz '2026-10-12 16:45:00+00')
where singleton is true;

create or replace function public.is_smsapi_legacy_callback_allowed(
  p_claim_id uuid,p_provider_message_id text
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cutoff timestamptz;
  v_valid_until timestamptz;
  v_claim_old boolean:=false;
  v_log_found boolean:=false;
  v_log_old boolean:=false;
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla webhooka SMS.' using errcode='42501';
  end if;

  select legacy_claim_cutoff,legacy_fallback_valid_until
  into v_cutoff,v_valid_until
  from private.sms_callback_auth_config
  where singleton is true;

  if v_cutoff is null or v_valid_until is null or now()>v_valid_until then return false; end if;

  if p_claim_id is not null then
    select exists(
      select 1 from private.sms_delivery_claims c
      where c.claim_id=p_claim_id and c.claimed_at<=v_cutoff
    ) into v_claim_old;
    if not v_claim_old then return false; end if;
  end if;

  if nullif(btrim(coalesce(p_provider_message_id,'')),'') is not null then
    select true,coalesce(l.sent_at,l.approved_at,l.created_at)<=v_cutoff
    into v_log_found,v_log_old
    from public.sms_log l
    where l.provider_message_id=p_provider_message_id
    order by l.created_at desc
    limit 1;

    if coalesce(v_log_found,false) and not coalesce(v_log_old,false) then return false; end if;
  end if;

  if p_claim_id is not null then return v_claim_old; end if;
  return coalesce(v_log_found,false) and coalesce(v_log_old,false);
end;
$function$;

revoke all on function public.is_smsapi_legacy_callback_allowed(uuid,text) from public,anon,authenticated;
grant execute on function public.is_smsapi_legacy_callback_allowed(uuid,text) to service_role;

create or replace function public.claim_service_sms_not_sent_retry(p_log_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  l public.sms_log%rowtype;
  d public.devices%rowtype;
  j public.jobs%rowtype;
  c public.contractors%rowtype;
  v_source_text text;
  v_source_job uuid;
  v_job_id uuid;
  v_phone text;
  v_client text;
  v_due_date date;
  v_installation_date date;
  v_cycle integer;
  v_group_id uuid;
  v_claim_id uuid;
  v_delivery_key text;
  v_status text;
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji wysyłającej.' using errcode='42501';
  end if;

  select * into l
  from public.sms_log
  where id=p_log_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok',false,'reason','log_not_found');
  end if;

  v_status := lower(btrim(coalesce(l.status,'')));

  if not private.sms_log_is_retryable_failure(
    l.status,l.provider_message_id,l.sent_at,l.delivered_at
  ) then
    return pg_catalog.jsonb_build_object('ok',false,'reason','log_not_retryable');
  end if;

  v_cycle := coalesce(l.reminder_cycle,1);

  if l.device_id is not null then
    select * into d from public.devices where id=l.device_id;
    if not found then
      return pg_catalog.jsonb_build_object('ok',false,'reason','device_not_found');
    end if;

    v_installation_date := d.installation_date;
    v_source_text := btrim(coalesce(d.source_job_id,''));

    if v_source_text <> '' then
      v_source_job := private.sms_source_job_uuid(v_source_text);
      if v_source_job is null then
        return pg_catalog.jsonb_build_object('ok',false,'reason','missing_linked_job_consent','message','Urządzenie ma nieprawidłowe powiązanie z kartą klienta.');
      end if;

      select * into j from public.jobs where id=v_source_job;
      if not found then
        return pg_catalog.jsonb_build_object('ok',false,'reason','job_not_found');
      end if;

      if j.sms_consent is not true or j.sms_reminder_enabled is not true then
        return pg_catalog.jsonb_build_object('ok',false,'reason','sms_disabled','message','Zgoda SMS lub przypomnienia są obecnie wyłączone.');
      end if;

      v_job_id := j.id;
      v_phone := private.normalize_sms_phone(coalesce(nullif(btrim(j.sms_recipient_phone),''),j.phone));
      v_client := coalesce(nullif(btrim(j.client),''),nullif(btrim(j.title),''),'Kliencie');
      if v_installation_date is null then v_installation_date := j.installation_date; end if;
    else
      if d.sms_consent is not true or d.sms_reminder_enabled is not true then
        return pg_catalog.jsonb_build_object('ok',false,'reason','sms_disabled','message','Zgoda SMS lub przypomnienia dla tego urządzenia są wyłączone.');
      end if;

      if d.contractor_id is null then
        return pg_catalog.jsonb_build_object('ok',false,'reason','missing_legacy_contractor');
      end if;

      select * into c from public.contractors where id=d.contractor_id;
      if not found then
        return pg_catalog.jsonb_build_object('ok',false,'reason','contractor_not_found');
      end if;

      v_phone := private.normalize_sms_phone(c.phone);
      v_client := coalesce(nullif(btrim(c.company_name),''),nullif(btrim(c.contact_person),''),'Kliencie');
      v_job_id := null;
    end if;
  elsif l.job_id is not null then
    select * into j from public.jobs where id=l.job_id;
    if not found then
      return pg_catalog.jsonb_build_object('ok',false,'reason','job_not_found');
    end if;

    if j.sms_consent is not true or j.sms_reminder_enabled is not true then
      return pg_catalog.jsonb_build_object('ok',false,'reason','sms_disabled','message','Zgoda SMS lub przypomnienia są obecnie wyłączone.');
    end if;

    v_job_id := j.id;
    v_phone := private.normalize_sms_phone(coalesce(nullif(btrim(j.sms_recipient_phone),''),j.phone));
    v_client := coalesce(nullif(btrim(j.client),''),nullif(btrim(j.title),''),'Kliencie');
    v_installation_date := j.installation_date;
  else
    return pg_catalog.jsonb_build_object('ok',false,'reason','missing_current_source','message','Nie można potwierdzić aktualnych danych klienta dla tego starego wpisu.');
  end if;

  if v_phone is null then
    return pg_catalog.jsonb_build_object('ok',false,'reason','invalid_current_phone','message','Aktualny numer telefonu klienta nie jest prawidłowym polskim numerem.');
  end if;

  v_due_date := coalesce(l.reminder_due_date,private.service_sms_due_date(v_installation_date,v_cycle));
  if v_due_date is null then
    return pg_catalog.jsonb_build_object('ok',false,'reason','missing_reminder_due_date');
  end if;

  v_group_id := private.ensure_sms_reminder_group_for_member(v_phone,v_due_date,l.device_id,v_job_id);

  if exists (
    select 1
    from public.sms_log s
    where s.reminder_group_id=v_group_id
      and s.id<>l.id
      and (
        lower(btrim(coalesce(s.status,''))) in ('sent','provider_sent','delivered')
        or s.provider_message_id is not null
        or s.sent_at is not null
        or s.delivered_at is not null
      )
  ) then
    return pg_catalog.jsonb_build_object('ok',false,'reason','group_already_sent','reminder_group_id',v_group_id);
  end if;

  v_delivery_key := 'retry-not-sent:' || p_log_id::text;

  insert into private.sms_delivery_claims(
    delivery_key,
    reminder_group_id,
    source_log_id,
    retry_of_log_id,
    job_id,
    device_id,
    recipient_phone,
    reminder_cycle,
    reminder_due_date,
    client
  )
  values(
    v_delivery_key,
    v_group_id,
    null,
    p_log_id,
    v_job_id,
    l.device_id,
    v_phone,
    v_cycle,
    v_due_date,
    v_client
  )
  on conflict do nothing
  returning claim_id into v_claim_id;

  if v_claim_id is null then
    return pg_catalog.jsonb_build_object('ok',false,'reason','retry_claim_exists','reminder_group_id',v_group_id);
  end if;

  return pg_catalog.jsonb_build_object(
    'ok',true,
    'claim_id',v_claim_id,
    'reminder_group_id',v_group_id,
    'recipient_phone',v_phone,
    'current_due_date',v_due_date,
    'window_end_date',v_due_date + 62,
    'linked_job_id',v_job_id,
    'device_id',l.device_id,
    'installation_date',v_installation_date,
    'client',v_client,
    'cycle',v_cycle,
    'retry_of_log_id',p_log_id,
    'consent_source',case when v_job_id is null then 'legacy_device' else 'job' end
  );
end;
$function$;

revoke all on function public.claim_service_sms_not_sent_retry(uuid) from public, anon, authenticated;
grant execute on function public.claim_service_sms_not_sent_retry(uuid) to service_role;

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
  v_unsent_logs jsonb;
  v_history_logs jsonb;
  v_today date := (current_timestamp at time zone 'Europe/Warsaw')::date;
  v_month_start date;
  v_next_month date;
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role'
     and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może odczytywać dane modułu SMS.' using errcode='42501';
  end if;

  v_month_start := date_trunc('month',v_today::timestamp)::date;
  v_next_month := (v_month_start + interval '1 month')::date;

  select pg_catalog.to_jsonb(s) into v_settings
  from (
    select id,is_enabled,sending_mode,sender_name,service_phone,company_name,
           template_service_reminder,updated_at
    from public.sms_settings
    order by updated_at desc nulls last,created_at desc nulls last
    limit 1
  ) s;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.row_to_json(x) order by x.created_at desc),'[]'::jsonb)
  into v_queue_logs
  from (
    select l.id,l.job_id,l.device_id,l.client,l.phone,l.sms_type,l.provider,l.provider_message_id,
           l.status,l.planned_for,l.approved_at,l.sent_at,l.delivered_at,l.error_message,l.reminder_cycle,
           l.reminder_due_date,l.reminder_group_id,l.reminder_group_primary,l.retry_of_log_id,
           g.anchor_due_date as reminder_group_anchor_date,g.window_end_date as reminder_group_window_end_date,l.created_at
    from public.sms_log l
    left join private.sms_reminder_groups g on g.id=l.reminder_group_id
    where l.sms_type='service_reminder'
      and (
        lower(btrim(coalesce(l.status,'')))='pending_approval'
        or l.reminder_due_date between (v_today-62) and v_today
      )
    order by l.created_at desc
  ) x;

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.row_to_json(x) order by coalesce(x.sent_at,x.approved_at,x.created_at) desc),
    '[]'::jsonb
  )
  into v_sent_this_month_logs
  from (
    select l.id,l.job_id,l.device_id,l.client,l.phone,l.sms_type,l.provider,l.provider_message_id,
           l.status,l.planned_for,l.approved_at,l.sent_at,l.delivered_at,l.error_message,l.reminder_cycle,
           l.reminder_due_date,l.reminder_group_id,l.reminder_group_primary,l.retry_of_log_id,
           g.anchor_due_date as reminder_group_anchor_date,g.window_end_date as reminder_group_window_end_date,l.created_at
    from public.sms_log l
    left join private.sms_reminder_groups g on g.id=l.reminder_group_id
    where lower(btrim(coalesce(l.status,''))) in ('sent','provider_sent','delivered')
      and (coalesce(l.sent_at,l.approved_at,l.created_at) at time zone 'Europe/Warsaw')::date >= v_month_start
      and (coalesce(l.sent_at,l.approved_at,l.created_at) at time zone 'Europe/Warsaw')::date < v_next_month
  ) x;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.row_to_json(x) order by x.reminder_due_date desc,x.created_at desc),'[]'::jsonb)
  into v_unsent_logs
  from (
    select l.id,l.job_id,l.device_id,l.client,l.phone,l.sms_type,l.provider,l.provider_message_id,
           l.status,l.planned_for,l.approved_at,l.sent_at,l.delivered_at,l.error_message,l.reminder_cycle,
           l.reminder_due_date,l.reminder_group_id,l.reminder_group_primary,l.retry_of_log_id,
           g.anchor_due_date as reminder_group_anchor_date,g.window_end_date as reminder_group_window_end_date,l.created_at
    from public.sms_log l
    left join private.sms_reminder_groups g on g.id=l.reminder_group_id
    where private.sms_log_is_retryable_failure(
            l.status,l.provider_message_id,l.sent_at,l.delivered_at
          )
      and not exists (
        select 1
        from private.sms_delivery_claims c
        where c.retry_of_log_id=l.id
      )
      and not exists (
        select 1
        from public.sms_log s
        where s.id<>l.id
          and (
            (l.reminder_group_id is not null and s.reminder_group_id=l.reminder_group_id)
            or (
              l.reminder_group_id is null
              and private.normalize_sms_phone(s.phone)=private.normalize_sms_phone(l.phone)
              and s.reminder_due_date is not null
              and l.reminder_due_date is not null
              and abs(s.reminder_due_date-l.reminder_due_date)<=62
            )
          )
          and (
            lower(btrim(coalesce(s.status,''))) in ('sent','provider_sent','delivered')
            or s.provider_message_id is not null
            or s.sent_at is not null
          )
      )
    order by l.reminder_due_date desc,l.created_at desc
  ) x;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.row_to_json(x) order by x.created_at desc),'[]'::jsonb)
  into v_history_logs
  from (
    select l.id,l.job_id,l.device_id,l.client,l.phone,l.sms_type,l.provider,l.provider_message_id,
           l.status,l.planned_for,l.approved_at,l.sent_at,l.delivered_at,l.error_message,l.reminder_cycle,
           l.reminder_due_date,l.reminder_group_id,l.reminder_group_primary,l.retry_of_log_id,
           g.anchor_due_date as reminder_group_anchor_date,g.window_end_date as reminder_group_window_end_date,l.created_at
    from public.sms_log l
    left join private.sms_reminder_groups g on g.id=l.reminder_group_id
    order by l.created_at desc
    limit 300
  ) x;

  return pg_catalog.jsonb_build_object(
    'settings',coalesce(v_settings,'{}'::jsonb),
    'logs',coalesce(v_queue_logs,'[]'::jsonb),
    'queue_logs',coalesce(v_queue_logs,'[]'::jsonb),
    'sent_this_month_logs',coalesce(v_sent_this_month_logs,'[]'::jsonb),
    'unsent_logs',coalesce(v_unsent_logs,'[]'::jsonb),
    'history_logs',coalesce(v_history_logs,'[]'::jsonb)
  );
end;
$function$;
