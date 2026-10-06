-- WAWIS 12.57 / SMS-01 + SMS-06
-- SMS-01: kolejne retry po kolejnych potwierdzonych błędach operatora nie może być blokowane przez starsze nieudane próby.
-- SMS-06: public.jobs.last_sms_* ma jedno źródło prawdy w triggerze private.remember_job_sms_send.
-- RPC nie może po triggerze ponownie interpretować statusu poprzedniej próby przez globalny ranking.

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where not tgisinternal
      and tgrelid='public.sms_log'::regclass
      and tgname='remember_job_sms_send'
  ) then
    raise exception 'SMS lifecycle migration aborted: brak triggera remember_job_sms_send.'
      using errcode='55000';
  end if;
end;
$$;

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
        or (
          not private.sms_log_is_retryable_failure(
            s.status,s.provider_message_id,s.sent_at,s.delivered_at
          )
          and (
            s.provider_message_id is not null
            or s.sent_at is not null
            or s.delivered_at is not null
          )
        )
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

create or replace function public.record_service_sms_acceptance(
  p_claim_id uuid,
  p_provider_message_id text,
  p_provider_response jsonb default null::jsonb
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
  v_now timestamptz := now();
  v_had_provider_proof boolean := false;
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

  if not found then
    return pg_catalog.jsonb_build_object('ok',false,'reason','claim_not_found');
  end if;

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

  l := null;

  if c.source_log_id is not null then
    select * into l
    from public.sms_log
    where id=c.source_log_id
    for update;
  end if;

  if l.id is null then
    select * into l
    from public.sms_log
    where provider_message_id=p_provider_message_id
    limit 1
    for update;
  end if;

  if l.id is null
     and c.retry_of_log_id is null
     and c.reminder_group_id is not null then
    select * into l
    from public.sms_log
    where reminder_group_id=c.reminder_group_id
      and reminder_group_primary
    order by created_at desc
    limit 1
    for update;
  end if;

  if l.id is not null then
    if l.provider_message_id is not null and l.provider_message_id<>p_provider_message_id then
      return pg_catalog.jsonb_build_object('ok',false,'reason','log_provider_message_id_mismatch');
    end if;

    v_had_provider_proof :=
      l.provider_message_id is not null
      or l.sent_at is not null
      or l.delivered_at is not null;

    if v_had_provider_proof then
      -- Callback mógł już odzyskać i zakończyć tę samą próbę.
      -- Acceptance dopisuje wyłącznie brakujące metadane i nigdy nie cofa statusu.
      update public.sms_log
      set provider='smsapi',
          provider_message_id=coalesce(provider_message_id,p_provider_message_id),
          provider_response=coalesce(p_provider_response,provider_response),
          planned_for=coalesce(planned_for,c.claimed_at),
          approved_at=coalesce(approved_at,c.staged_at,v_now),
          approved_by=coalesce(approved_by,c.approved_by),
          sent_at=coalesce(sent_at,v_now)
      where id=l.id
      returning * into l;
    else
      -- Pierwsze utrwalenie akceptacji: snapshot pochodzi z claimu i od tej chwili jest historyczny.
      update public.sms_log
      set job_id=coalesce(c.job_id,job_id),
          device_id=coalesce(c.device_id,device_id),
          client=coalesce(c.client,client),
          phone=coalesce(c.recipient_phone,phone),
          message=coalesce(nullif(c.message,''),message),
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
          reminder_group_primary=case when c.retry_of_log_id is null then true else reminder_group_primary end
      where id=l.id
      returning * into l;
    end if;

    v_log_id := l.id;
  elsif c.retry_of_log_id is not null then
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
    returning * into l;

    v_log_id := l.id;
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
    returning * into l;

    v_log_id := l.id;
  end if;

  if v_log_id is null then
    raise exception 'Nie udało się utrwalić zaakceptowanej wysyłki SMS.' using errcode='55000';
  end if;

  update private.sms_delivery_claims
  set source_log_id=v_log_id
  where claim_id=p_claim_id
    and source_log_id is distinct from v_log_id;

  return pg_catalog.jsonb_build_object(
    'ok',true,
    'claim_id',p_claim_id,
    'log_id',v_log_id,
    'provider_message_id',p_provider_message_id,
    'status',l.status,
    'retry_of_log_id',c.retry_of_log_id
  );
end;
$function$;

create or replace function public.apply_sms_delivery_atomic_v2(
  p_provider_message_id text,
  p_claim_id uuid,
  p_status text,
  p_error text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  l public.sms_log%rowtype;
  c private.sms_delivery_claims%rowtype;
  v_rank integer;
  v_now timestamptz:=now();
  v_recovered boolean:=false;
  v_had_provider_proof boolean:=false;
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
  limit 1
  for update;

  if l.id is null and p_claim_id is not null then
    select * into c
    from private.sms_delivery_claims
    where claim_id=p_claim_id
    for update;

    if not found then
      select * into l
      from public.sms_log
      where provider_message_id=p_provider_message_id
      limit 1
      for update;

      if l.id is null then
        return pg_catalog.jsonb_build_object('ok',false,'status',404,'error','sms_claim_not_found');
      end if;
    else
      if c.provider_message_id is not null and c.provider_message_id<>p_provider_message_id then
        return pg_catalog.jsonb_build_object('ok',false,'status',409,'error','claim_provider_message_id_mismatch');
      end if;

      if c.staged_at is null or nullif(btrim(coalesce(c.message,'')),'') is null then
        return pg_catalog.jsonb_build_object('ok',false,'status',409,'error','claim_not_staged');
      end if;

      update private.sms_delivery_claims
      set provider_message_id=p_provider_message_id,
          confirmed_at=coalesce(confirmed_at,v_now),
          last_error=null,
          uncertain_at=null
      where claim_id=p_claim_id;

      if c.source_log_id is not null then
        select * into l
        from public.sms_log
        where id=c.source_log_id
        for update;
      end if;

      if l.id is null then
        select * into l
        from public.sms_log
        where provider_message_id=p_provider_message_id
        limit 1
        for update;
      end if;

      if l.id is not null then
        if l.provider_message_id is not null and l.provider_message_id<>p_provider_message_id then
          return pg_catalog.jsonb_build_object('ok',false,'status',409,'error','log_provider_message_id_mismatch');
        end if;

        v_had_provider_proof :=
          l.provider_message_id is not null
          or l.sent_at is not null
          or l.delivered_at is not null;

        if not v_had_provider_proof then
          update public.sms_log
          set job_id=coalesce(c.job_id,job_id),
              device_id=coalesce(c.device_id,device_id),
              client=coalesce(c.client,client),
              phone=coalesce(c.recipient_phone,phone),
              message=coalesce(nullif(c.message,''),message),
              provider='smsapi',
              provider_message_id=p_provider_message_id,
              status='provider_sent',
              planned_for=coalesce(planned_for,c.claimed_at),
              sent_at=coalesce(sent_at,v_now),
              approved_at=coalesce(approved_at,c.staged_at,v_now),
              approved_by=coalesce(approved_by,c.approved_by),
              error_message=null,
              reminder_cycle=coalesce(c.reminder_cycle,reminder_cycle),
              reminder_due_date=coalesce(c.reminder_due_date,reminder_due_date),
              reminder_group_id=coalesce(c.reminder_group_id,reminder_group_id),
              reminder_group_primary=case when c.retry_of_log_id is null then true else reminder_group_primary end
          where id=l.id
          returning * into l;
        end if;
      elsif c.retry_of_log_id is not null then
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
        if c.source_log_id is not null then
          select * into l
          from public.sms_log
          where id=c.source_log_id
          for update;
        end if;

        if l.id is null and c.reminder_group_id is not null then
          select * into l
          from public.sms_log
          where reminder_group_id=c.reminder_group_id
            and reminder_group_primary
          order by created_at desc
          limit 1
          for update;
        end if;

        if l.id is not null then
          if l.provider_message_id is not null and l.provider_message_id<>p_provider_message_id then
            return pg_catalog.jsonb_build_object('ok',false,'status',409,'error','log_provider_message_id_mismatch');
          end if;

          v_had_provider_proof :=
            l.provider_message_id is not null
            or l.sent_at is not null
            or l.delivered_at is not null;

          if not v_had_provider_proof then
            update public.sms_log
            set job_id=coalesce(c.job_id,job_id),
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
          end if;
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

      if l.id is null then
        return pg_catalog.jsonb_build_object('ok',false,'status',500,'error','sms_log_recovery_failed');
      end if;

      update private.sms_delivery_claims
      set source_log_id=l.id
      where claim_id=p_claim_id
        and source_log_id is distinct from l.id;

      v_recovered := true;
    end if;
  end if;

  if l.id is null then
    return pg_catalog.jsonb_build_object('ok',false,'status',404,'error','sms_log_not_found');
  end if;

  v_rank := private.sms_delivery_rank(p_status);

  if v_rank>private.sms_delivery_rank(l.status) then
    update public.sms_log
    set status=p_status,
        error_message=case when p_status='error' then p_error else null end,
        delivered_at=case when p_status='delivered' then coalesce(delivered_at,v_now) else delivered_at end
    where id=l.id
    returning * into l;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok',true,
    'providerMessageId',p_provider_message_id,
    'nextStatus',l.status,
    'logId',l.id,
    'recoveredFromClaim',v_recovered,
    'retryOfLogId',l.retry_of_log_id
  );
end;
$function$;

revoke all on function public.apply_sms_delivery_atomic_v2(text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.apply_sms_delivery_atomic_v2(text,uuid,text,text) to service_role;

