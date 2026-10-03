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

  if v_status = 'not_sent' then
    if l.provider_message_id is not null
       or l.sent_at is not null
       or l.delivered_at is not null then
      return pg_catalog.jsonb_build_object('ok',false,'reason','log_not_retryable');
    end if;
  elsif v_status = 'error' then
    if l.provider_message_id is null
       or l.delivered_at is not null then
      return pg_catalog.jsonb_build_object('ok',false,'reason','log_not_retryable');
    end if;
  else
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

  v_group_id := private.ensure_sms_reminder_group(v_phone,v_due_date);

  if exists (
    select 1
    from public.sms_log s
    where s.reminder_group_id=v_group_id
      and s.id<>l.id
      and lower(btrim(coalesce(s.status,''))) in ('sent','provider_sent','delivered')
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


-- Czytelny zapis już istniejących callbacków UNDELIVERED zamiast surowego JSON-a.
update public.sms_log
set error_message = 'SMSAPI: wiadomość niedostarczona (kod 405).'
where lower(btrim(coalesce(status,''))) = 'error'
  and error_message like '%"status_name":"UNDELIVERED"%'
  and error_message like '%"status":"405"%';
