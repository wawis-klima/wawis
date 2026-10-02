-- SMS v12.23: zakładka Niewysłane i ręczne ponowienie poza 62-dniowym oknem.
-- Stary rekord not_sent pozostaje historią; ponowienie tworzy nowy wpis retry_of_log_id.

alter table private.sms_delivery_claims
  add column if not exists retry_of_log_id uuid;

alter table public.sms_log
  add column if not exists retry_of_log_id uuid references public.sms_log(id) on delete set null;

create index if not exists idx_sms_delivery_claims_retry_of_log
  on private.sms_delivery_claims(retry_of_log_id)
  where retry_of_log_id is not null;

create index if not exists idx_sms_log_retry_of_log
  on public.sms_log(retry_of_log_id)
  where retry_of_log_id is not null;

CREATE OR REPLACE FUNCTION public.claim_service_sms_not_sent_retry(p_log_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if lower(btrim(coalesce(l.status,''))) <> 'not_sent'
     or l.provider_message_id is not null
     or l.sent_at is not null
     or l.delivered_at is not null then
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
      and (
        lower(btrim(coalesce(s.status,''))) in ('sent','provider_sent','delivered')
        or s.provider_message_id is not null
        or s.sent_at is not null
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

CREATE OR REPLACE FUNCTION public.record_service_sms_acceptance(p_claim_id uuid, p_provider_message_id text, p_provider_response jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c private.sms_delivery_claims%rowtype;
  l public.sms_log%rowtype;
  v_log_id uuid;
  v_now timestamptz := now();
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji wysyłającej.' using errcode='42501';
  end if;

  if p_claim_id is null or nullif(btrim(coalesce(p_provider_message_id,'')),'') is null then
    return pg_catalog.jsonb_build_object('ok',false,'reason','invalid_acceptance_payload');
  end if;

  select * into c
  from private.sms_delivery_claims
  where claim_id=p_claim_id
  for update;

  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','claim_not_found'); end if;
  if c.staged_at is null or nullif(btrim(coalesce(c.message,'')),'') is null then
    return pg_catalog.jsonb_build_object('ok',false,'reason','claim_not_staged');
  end if;
  if c.provider_message_id is not null and c.provider_message_id<>p_provider_message_id then
    return pg_catalog.jsonb_build_object('ok',false,'reason','provider_message_id_mismatch');
  end if;

  update private.sms_delivery_claims
  set provider_message_id=p_provider_message_id,
      confirmed_at=coalesce(confirmed_at,v_now),
      last_error=null,
      uncertain_at=null
  where claim_id=p_claim_id;

  if c.retry_of_log_id is not null then
    insert into public.sms_log(
      job_id,device_id,client,phone,message,sms_type,provider,provider_message_id,provider_response,
      status,planned_for,approved_at,approved_by,sent_at,created_by,reminder_cycle,reminder_due_date,
      reminder_group_id,reminder_group_primary,retry_of_log_id
    )
    values(
      c.job_id,c.device_id,c.client,c.recipient_phone,c.message,'service_reminder','smsapi',
      p_provider_message_id,p_provider_response,'provider_sent',c.claimed_at,
      coalesce(c.staged_at,v_now),c.approved_by,v_now,c.approved_by,c.reminder_cycle,c.reminder_due_date,
      c.reminder_group_id,false,c.retry_of_log_id
    )
    returning id into v_log_id;
  else
    l := null;
    if c.source_log_id is not null then
      select * into l from public.sms_log where id=c.source_log_id for update;
    end if;
    if l.id is null and c.reminder_group_id is not null then
      select * into l
      from public.sms_log
      where reminder_group_id=c.reminder_group_id and reminder_group_primary
      order by created_at desc
      limit 1
      for update;
    end if;

    if l.id is not null then
      if l.provider_message_id is not null and l.provider_message_id<>p_provider_message_id then
        return pg_catalog.jsonb_build_object('ok',false,'reason','log_provider_message_id_mismatch');
      end if;
      update public.sms_log set
        job_id=coalesce(c.job_id,job_id),
        device_id=coalesce(c.device_id,device_id),
        client=coalesce(c.client,client),
        phone=coalesce(c.recipient_phone,phone),
        message=coalesce(c.message,message),
        provider='smsapi',
        provider_message_id=p_provider_message_id,
        provider_response=coalesce(p_provider_response,provider_response),
        status='provider_sent',
        planned_for=coalesce(planned_for,c.claimed_at),
        approved_at=coalesce(approved_at,c.staged_at,v_now),
        approved_by=coalesce(approved_by,c.approved_by),
        sent_at=coalesce(sent_at,v_now),
        error_message=null,
        reminder_cycle=coalesce(c.reminder_cycle,reminder_cycle),
        reminder_due_date=coalesce(c.reminder_due_date,reminder_due_date),
        reminder_group_id=coalesce(c.reminder_group_id,reminder_group_id),
        reminder_group_primary=true
      where id=l.id
      returning id into v_log_id;
    else
      insert into public.sms_log(
        job_id,device_id,client,phone,message,sms_type,provider,provider_message_id,provider_response,
        status,planned_for,approved_at,approved_by,sent_at,created_by,reminder_cycle,reminder_due_date,
        reminder_group_id,reminder_group_primary
      )
      values(
        c.job_id,c.device_id,c.client,c.recipient_phone,c.message,'service_reminder','smsapi',
        p_provider_message_id,p_provider_response,'provider_sent',c.claimed_at,
        coalesce(c.staged_at,v_now),c.approved_by,v_now,c.approved_by,c.reminder_cycle,c.reminder_due_date,
        c.reminder_group_id,true
      )
      returning id into v_log_id;
    end if;
  end if;

  if v_log_id is null then
    raise exception 'Nie udało się utrwalić zaakceptowanej wysyłki SMS.' using errcode='55000';
  end if;

  update private.sms_delivery_claims set source_log_id=v_log_id where claim_id=p_claim_id;

  if c.job_id is not null then
    update public.jobs set
      last_sms_log_id=v_log_id,
      last_sms_sent_at=v_now,
      last_sms_status='provider_sent',
      last_sms_error=null,
      sms_recipient_phone=coalesce(c.recipient_phone,sms_recipient_phone)
    where id=c.job_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok',true,'claim_id',p_claim_id,'log_id',v_log_id,
    'provider_message_id',p_provider_message_id,'status','provider_sent',
    'retry_of_log_id',c.retry_of_log_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.reject_service_sms_claim(p_claim_id uuid, p_error text, p_provider_response jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c private.sms_delivery_claims%rowtype;
  l public.sms_log%rowtype;
  v_log_id uuid;
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji wysyłającej.' using errcode='42501';
  end if;

  select * into c
  from private.sms_delivery_claims
  where claim_id=p_claim_id
  for update;

  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','claim_not_found'); end if;
  if c.provider_message_id is not null or c.confirmed_at is not null then
    return pg_catalog.jsonb_build_object('ok',false,'reason','claim_already_confirmed');
  end if;

  if c.retry_of_log_id is not null then
    insert into public.sms_log(
      job_id,device_id,client,phone,message,sms_type,provider,provider_response,status,
      planned_for,approved_at,approved_by,created_by,error_message,reminder_cycle,reminder_due_date,
      reminder_group_id,reminder_group_primary,retry_of_log_id
    )
    values(
      c.job_id,c.device_id,c.client,c.recipient_phone,coalesce(c.message,''),'service_reminder','smsapi',
      p_provider_response,'error',c.claimed_at,coalesce(c.staged_at,now()),c.approved_by,c.approved_by,
      nullif(btrim(coalesce(p_error,'')),''),c.reminder_cycle,c.reminder_due_date,
      c.reminder_group_id,false,c.retry_of_log_id
    )
    returning id into v_log_id;
  else
    l := null;
    if c.source_log_id is not null then
      select * into l from public.sms_log where id=c.source_log_id for update;
    end if;
    if l.id is null and c.reminder_group_id is not null then
      select * into l
      from public.sms_log
      where reminder_group_id=c.reminder_group_id and reminder_group_primary
      order by created_at desc
      limit 1
      for update;
    end if;

    if l.id is not null then
      update public.sms_log set
        status='error',
        error_message=nullif(btrim(coalesce(p_error,'')),''),
        provider_response=coalesce(p_provider_response,provider_response),
        approved_at=coalesce(approved_at,c.staged_at,now()),
        approved_by=coalesce(approved_by,c.approved_by)
      where id=l.id
      returning id into v_log_id;
    else
      insert into public.sms_log(
        job_id,device_id,client,phone,message,sms_type,provider,provider_response,status,planned_for,
        approved_at,approved_by,created_by,error_message,reminder_cycle,reminder_due_date,
        reminder_group_id,reminder_group_primary
      )
      values(
        c.job_id,c.device_id,c.client,c.recipient_phone,coalesce(c.message,''),'service_reminder','smsapi',
        p_provider_response,'error',c.claimed_at,coalesce(c.staged_at,now()),c.approved_by,c.approved_by,
        nullif(btrim(coalesce(p_error,'')),''),c.reminder_cycle,c.reminder_due_date,c.reminder_group_id,true
      )
      returning id into v_log_id;
    end if;
  end if;

  if c.job_id is not null then
    update public.jobs set
      last_sms_log_id=v_log_id,
      last_sms_status='error',
      last_sms_error=nullif(btrim(coalesce(p_error,'')),'')
    where id=c.job_id;
  end if;

  delete from private.sms_delivery_claims where claim_id=p_claim_id;

  return pg_catalog.jsonb_build_object(
    'ok',true,'released',true,'log_id',v_log_id,'retry_of_log_id',c.retry_of_log_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_sms_delivery_atomic_v2(p_provider_message_id text, p_claim_id uuid, p_status text, p_error text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  l public.sms_log%rowtype;
  c private.sms_delivery_claims%rowtype;
  j public.jobs%rowtype;
  v_rank integer;
  v_now timestamptz:=now();
  v_recovered boolean:=false;
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then
    raise exception 'Dostęp wyłącznie dla webhooka SMS.' using errcode='42501';
  end if;
  if nullif(btrim(coalesce(p_provider_message_id,'')),'') is null then
    raise exception 'missing_provider_message_id' using errcode='22023';
  end if;
  if p_status not in ('provider_sent','error','delivered') then
    raise exception 'invalid_sms_status' using errcode='22023';
  end if;

  l := null;
  select * into l
  from public.sms_log
  where provider_message_id=p_provider_message_id
  order by created_at desc
  limit 1
  for update;

  if l.id is null and p_claim_id is not null then
    select * into c
    from private.sms_delivery_claims
    where claim_id=p_claim_id
    for update;

    if not found then
      return pg_catalog.jsonb_build_object('ok',false,'status',404,'error','sms_claim_not_found');
    end if;
    if c.provider_message_id is not null and c.provider_message_id<>p_provider_message_id then
      return pg_catalog.jsonb_build_object('ok',false,'status',409,'error','claim_provider_message_id_mismatch');
    end if;

    update private.sms_delivery_claims set
      provider_message_id=p_provider_message_id,
      confirmed_at=coalesce(confirmed_at,v_now),
      last_error=null,
      uncertain_at=null
    where claim_id=p_claim_id;

    if c.retry_of_log_id is not null then
      if nullif(btrim(coalesce(c.message,'')),'') is null then
        return pg_catalog.jsonb_build_object('ok',false,'status',409,'error','claim_not_staged');
      end if;

      insert into public.sms_log(
        job_id,device_id,client,phone,message,sms_type,provider,provider_message_id,status,
        planned_for,approved_at,approved_by,sent_at,created_by,reminder_cycle,reminder_due_date,
        reminder_group_id,reminder_group_primary,retry_of_log_id
      )
      values(
        c.job_id,c.device_id,c.client,c.recipient_phone,c.message,'service_reminder','smsapi',
        p_provider_message_id,'provider_sent',c.claimed_at,coalesce(c.staged_at,v_now),c.approved_by,
        v_now,c.approved_by,c.reminder_cycle,c.reminder_due_date,c.reminder_group_id,false,c.retry_of_log_id
      )
      returning * into l;
    else
      l := null;

      if c.source_log_id is not null then
        select * into l from public.sms_log where id=c.source_log_id for update;
      end if;

      if l.id is null and c.reminder_group_id is not null then
        select * into l
        from public.sms_log
        where reminder_group_id=c.reminder_group_id and reminder_group_primary
        order by created_at desc
        limit 1
        for update;
      end if;

      if l.id is not null then
        if l.provider_message_id is not null and l.provider_message_id<>p_provider_message_id then
          return pg_catalog.jsonb_build_object('ok',false,'status',409,'error','log_provider_message_id_mismatch');
        end if;

        update public.sms_log set
          job_id=coalesce(c.job_id,job_id),
          device_id=coalesce(c.device_id,device_id),
          client=coalesce(c.client,client),
          phone=coalesce(c.recipient_phone,phone),
          message=coalesce(nullif(c.message,''),message),
          provider='smsapi',
          provider_message_id=p_provider_message_id,
          sent_at=coalesce(sent_at,v_now),
          approved_at=coalesce(approved_at,c.staged_at,v_now),
          approved_by=coalesce(approved_by,c.approved_by),
          reminder_cycle=coalesce(c.reminder_cycle,reminder_cycle),
          reminder_due_date=coalesce(c.reminder_due_date,reminder_due_date),
          reminder_group_id=coalesce(c.reminder_group_id,reminder_group_id),
          reminder_group_primary=true
        where id=l.id
        returning * into l;
      else
        if nullif(btrim(coalesce(c.message,'')),'') is null then
          return pg_catalog.jsonb_build_object('ok',false,'status',409,'error','claim_not_staged');
        end if;

        insert into public.sms_log(
          job_id,device_id,client,phone,message,sms_type,provider,provider_message_id,status,
          planned_for,approved_at,approved_by,sent_at,created_by,reminder_cycle,reminder_due_date,
          reminder_group_id,reminder_group_primary
        )
        values(
          c.job_id,c.device_id,c.client,c.recipient_phone,c.message,'service_reminder','smsapi',
          p_provider_message_id,'provider_sent',c.claimed_at,coalesce(c.staged_at,v_now),c.approved_by,
          v_now,c.approved_by,c.reminder_cycle,c.reminder_due_date,c.reminder_group_id,true
        )
        returning * into l;
      end if;
    end if;

    update private.sms_delivery_claims set source_log_id=l.id where claim_id=p_claim_id;
    v_recovered := true;
  end if;

  if l.id is null then
    return pg_catalog.jsonb_build_object('ok',false,'status',404,'error','sms_log_not_found');
  end if;

  v_rank := private.sms_delivery_rank(p_status);

  if v_rank>private.sms_delivery_rank(l.status) then
    update public.sms_log set
      status=p_status,
      error_message=case when p_status='error' then p_error else null end,
      delivered_at=case when p_status='delivered' then coalesce(delivered_at,v_now) else delivered_at end
    where id=l.id
    returning * into l;
  end if;

  if l.job_id is not null then
    select * into j from public.jobs where id=l.job_id for update;
    if found and (
      j.last_sms_log_id=l.id
      or j.last_sms_sent_at is null
      or l.sent_at is null
      or l.sent_at>=j.last_sms_sent_at
    ) then
      update public.jobs set
        last_sms_log_id=l.id,
        last_sms_sent_at=coalesce(l.sent_at,last_sms_sent_at),
        last_sms_status=case when v_rank>private.sms_delivery_rank(last_sms_status) then p_status else last_sms_status end,
        last_sms_error=case
          when v_rank>private.sms_delivery_rank(last_sms_status) and p_status='error' then p_error
          when v_rank>private.sms_delivery_rank(last_sms_status) then null
          else last_sms_error
        end
      where id=l.job_id;
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok',true,
    'providerMessageId',p_provider_message_id,
    'nextStatus',p_status,
    'logId',l.id,
    'recoveredFromClaim',v_recovered,
    'retryOfLogId',l.retry_of_log_id
  );
end;
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
    pg_catalog.jsonb_agg(pg_catalog.row_to_json(x) order by coalesce(x.delivered_at,x.sent_at,x.approved_at,x.created_at) desc),
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
      and (coalesce(l.delivered_at,l.sent_at,l.approved_at,l.created_at) at time zone 'Europe/Warsaw')::date >= v_month_start
      and (coalesce(l.delivered_at,l.sent_at,l.approved_at,l.created_at) at time zone 'Europe/Warsaw')::date < v_next_month
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
    where lower(btrim(coalesce(l.status,'')))='not_sent'
      and l.provider_message_id is null
      and l.sent_at is null
      and l.delivered_at is null
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

revoke all on function public.claim_service_sms_not_sent_retry(uuid) from public;
revoke all on function public.claim_service_sms_not_sent_retry(uuid) from anon;
revoke all on function public.claim_service_sms_not_sent_retry(uuid) from authenticated;
grant execute on function public.claim_service_sms_not_sent_retry(uuid) to service_role;

revoke all on function public.record_service_sms_acceptance(uuid,text,jsonb) from public;
revoke all on function public.record_service_sms_acceptance(uuid,text,jsonb) from anon;
revoke all on function public.record_service_sms_acceptance(uuid,text,jsonb) from authenticated;
grant execute on function public.record_service_sms_acceptance(uuid,text,jsonb) to service_role;

revoke all on function public.reject_service_sms_claim(uuid,text,jsonb) from public;
revoke all on function public.reject_service_sms_claim(uuid,text,jsonb) from anon;
revoke all on function public.reject_service_sms_claim(uuid,text,jsonb) from authenticated;
grant execute on function public.reject_service_sms_claim(uuid,text,jsonb) to service_role;

revoke all on function public.apply_sms_delivery_atomic_v2(text,uuid,text,text) from public;
revoke all on function public.apply_sms_delivery_atomic_v2(text,uuid,text,text) from anon;
revoke all on function public.apply_sms_delivery_atomic_v2(text,uuid,text,text) from authenticated;
grant execute on function public.apply_sms_delivery_atomic_v2(text,uuid,text,text) to service_role;
