-- SMS v12.42: krytyczne zabezpieczenia P0 po audycie 2026-10-05.
-- P0-01: jedna aktywna próba wysyłki na reminder_group_id.
-- P0-02: idempotentna współpraca acceptance/callback + unikalny provider_message_id.
-- P0-03: niezmienny snapshot wiadomości po rozpoczęciu kontaktu z operatorem.

do $$
begin
  if exists (
    select 1
    from private.sms_delivery_claims
    where reminder_group_id is not null
      and confirmed_at is null
    group by reminder_group_id
    having count(*) > 1
  ) then
    raise exception 'SMS P0 migration aborted: istnieje więcej niż jeden aktywny claim dla reminder_group_id.'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.sms_log
    where provider_message_id is not null
    group by provider_message_id
    having count(*) > 1
  ) then
    raise exception 'SMS P0 migration aborted: istnieją zduplikowane provider_message_id w sms_log.'
      using errcode = '23505';
  end if;
end;
$$;

create unique index if not exists uq_sms_delivery_claims_active_group
  on private.sms_delivery_claims(reminder_group_id)
  where reminder_group_id is not null
    and confirmed_at is null;

create unique index if not exists uq_sms_log_provider_message_id
  on public.sms_log(provider_message_id)
  where provider_message_id is not null;

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
  j public.jobs%rowtype;
  v_log_id uuid;
  v_now timestamptz := now();
  v_had_provider_proof boolean := false;
  v_rank integer;
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

  if l.job_id is not null then
    select * into j
    from public.jobs
    where id=l.job_id
    for update;

    if found and (
      j.last_sms_log_id=l.id
      or j.last_sms_sent_at is null
      or l.sent_at is null
      or l.sent_at>=j.last_sms_sent_at
    ) then
      v_rank := private.sms_delivery_rank(l.status);

      update public.jobs
      set last_sms_log_id=l.id,
          last_sms_sent_at=coalesce(l.sent_at,last_sms_sent_at),
          last_sms_status=case
            when v_rank>=private.sms_delivery_rank(last_sms_status) then l.status
            else last_sms_status
          end,
          last_sms_error=case
            when v_rank>=private.sms_delivery_rank(last_sms_status) and lower(coalesce(l.status,''))='error'
              then l.error_message
            when v_rank>private.sms_delivery_rank(last_sms_status)
              then null
            else last_sms_error
          end,
          sms_recipient_phone=coalesce(c.recipient_phone,sms_recipient_phone)
      where id=l.job_id;
    end if;
  end if;

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
  j public.jobs%rowtype;
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
      -- Claim może już nie istnieć dla historycznych callbacków; provider_message_id pozostaje źródłem prawdy.
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

      update private.sms_delivery_claims
      set provider_message_id=p_provider_message_id,
          confirmed_at=coalesce(confirmed_at,v_now),
          last_error=null,
          uncertain_at=null
      where claim_id=p_claim_id;

      -- Acceptance mogło zakończyć zapis w czasie, gdy callback czekał na blokadę claimu.
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
          set provider='smsapi',
              provider_message_id=p_provider_message_id,
              sent_at=coalesce(sent_at,v_now),
              approved_at=coalesce(approved_at,c.staged_at,v_now),
              approved_by=coalesce(approved_by,c.approved_by)
          where id=l.id
          returning * into l;
        end if;
      elsif c.retry_of_log_id is not null then
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

  if l.job_id is not null then
    select * into j
    from public.jobs
    where id=l.job_id
    for update;

    if found and (
      j.last_sms_log_id=l.id
      or j.last_sms_sent_at is null
      or l.sent_at is null
      or l.sent_at>=j.last_sms_sent_at
    ) then
      update public.jobs
      set last_sms_log_id=l.id,
          last_sms_sent_at=coalesce(l.sent_at,last_sms_sent_at),
          last_sms_status=case
            when v_rank>private.sms_delivery_rank(last_sms_status) then p_status
            else last_sms_status
          end,
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
    'nextStatus',l.status,
    'logId',l.id,
    'recoveredFromClaim',v_recovered,
    'retryOfLogId',l.retry_of_log_id
  );
end;
$function$;

create or replace function public.protect_sms_log_history()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_old_status text;
  v_new_status text;
  v_has_provider_proof boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'Historia SMS nie może być fizycznie usuwana.'
      using errcode = '55000';
  end if;

  v_old_status := lower(trim(coalesce(old.status, '')));
  v_new_status := lower(trim(coalesce(new.status, '')));
  v_has_provider_proof :=
    old.provider_message_id is not null
    or old.sent_at is not null
    or old.delivered_at is not null;

  if old.provider_message_id is not null
     and new.provider_message_id is distinct from old.provider_message_id then
    raise exception 'Identyfikator operatora SMS nie może zostać nadpisany.'
      using errcode = '55000';
  end if;

  if old.sent_at is not null and new.sent_at is null then
    raise exception 'Data wysłania SMS nie może zostać wyczyszczona.'
      using errcode = '55000';
  end if;

  if old.delivered_at is not null and new.delivered_at is null then
    raise exception 'Data doręczenia SMS nie może zostać wyczyszczona.'
      using errcode = '55000';
  end if;

  if v_has_provider_proof then
    if new.job_id is distinct from old.job_id
       or new.device_id is distinct from old.device_id
       or new.client is distinct from old.client
       or new.phone is distinct from old.phone
       or new.message is distinct from old.message
       or new.sms_type is distinct from old.sms_type
       or new.provider is distinct from old.provider
       or new.reminder_cycle is distinct from old.reminder_cycle
       or new.reminder_due_date is distinct from old.reminder_due_date
       or new.reminder_group_id is distinct from old.reminder_group_id
       or new.reminder_group_primary is distinct from old.reminder_group_primary
       or new.retry_of_log_id is distinct from old.retry_of_log_id then
      raise exception 'Snapshot wysłanego SMS nie może zostać zmieniony.'
        using errcode = '55000';
    end if;

    if v_new_status in ('pending_approval','approved','not_sent')
       and v_new_status is distinct from v_old_status then
      raise exception 'Status rozpoczętej wysyłki SMS nie może wrócić do kolejki.'
        using errcode = '55000';
    end if;

    if v_old_status in ('provider_sent','sent','error','delivered')
       and v_new_status in ('provider_sent','sent','error','delivered')
       and private.sms_delivery_rank(v_new_status) < private.sms_delivery_rank(v_old_status) then
      raise exception 'Status doręczenia SMS nie może zostać cofnięty.'
        using errcode = '55000';
    end if;
  end if;

  if v_new_status = 'deleted' then
    if v_old_status not in ('pending_approval', 'not_sent', 'deleted')
       or old.provider_message_id is not null
       or old.sent_at is not null
       or old.delivered_at is not null
       or new.provider_message_id is not null
       or new.sent_at is not null
       or new.delivered_at is not null then
      raise exception 'Nie można anulować rozpoczętej lub zakończonej wysyłki SMS.'
        using errcode = '55000';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.record_service_sms_acceptance(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.record_service_sms_acceptance(uuid,text,jsonb) to service_role;

revoke all on function public.apply_sms_delivery_atomic_v2(text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.apply_sms_delivery_atomic_v2(text,uuid,text,text) to service_role;
