-- SMS Etap 4 / v12.21: niezawodna wysyłka, staging claima, atomowe utrwalenie akceptacji
-- oraz odzyskanie sms_log z callbacku SMSAPI po idx/claim_id.

alter table private.sms_delivery_claims
  add column if not exists reminder_group_id uuid,
  add column if not exists source_log_id uuid,
  add column if not exists job_id uuid,
  add column if not exists device_id uuid,
  add column if not exists recipient_phone text,
  add column if not exists reminder_cycle integer,
  add column if not exists reminder_due_date date,
  add column if not exists client text,
  add column if not exists message text,
  add column if not exists approved_by uuid,
  add column if not exists staged_at timestamptz,
  add column if not exists last_error text,
  add column if not exists uncertain_at timestamptz;

create unique index if not exists uq_sms_delivery_claims_provider_message_id
  on private.sms_delivery_claims(provider_message_id)
  where provider_message_id is not null;

create index if not exists idx_sms_delivery_claims_group
  on private.sms_delivery_claims(reminder_group_id);

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
  v_client text;
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
  v_client := coalesce(nullif(btrim(v_job.client), ''), nullif(btrim(v_job.title), ''), 'Kliencie');

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
    'cycle', p_cycle
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.stage_service_sms_claim(p_claim_id uuid, p_message text, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_claim private.sms_delivery_claims%rowtype;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji wysyłającej.' using errcode = '42501';
  end if;

  if p_claim_id is null or nullif(btrim(coalesce(p_message, '')), '') is null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_stage_payload');
  end if;

  select * into v_claim
  from private.sms_delivery_claims
  where claim_id = p_claim_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'claim_not_found');
  end if;

  if v_claim.provider_message_id is not null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'claim_already_confirmed');
  end if;

  update private.sms_delivery_claims
  set
    message = p_message,
    approved_by = p_actor_id,
    staged_at = coalesce(staged_at, now()),
    last_error = null,
    uncertain_at = null
  where claim_id = p_claim_id;

  return pg_catalog.jsonb_build_object('ok', true, 'claim_id', p_claim_id);
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
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then raise exception 'Dostęp wyłącznie dla funkcji wysyłającej.' using errcode='42501'; end if;
  if p_claim_id is null or nullif(btrim(coalesce(p_provider_message_id, '')), '') is null then return pg_catalog.jsonb_build_object('ok',false,'reason','invalid_acceptance_payload'); end if;

  select * into c from private.sms_delivery_claims where claim_id=p_claim_id for update;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','claim_not_found'); end if;
  if c.staged_at is null or nullif(btrim(coalesce(c.message,'')),'') is null then return pg_catalog.jsonb_build_object('ok',false,'reason','claim_not_staged'); end if;
  if c.provider_message_id is not null and c.provider_message_id<>p_provider_message_id then return pg_catalog.jsonb_build_object('ok',false,'reason','provider_message_id_mismatch'); end if;

  update private.sms_delivery_claims set provider_message_id=p_provider_message_id,confirmed_at=coalesce(confirmed_at,v_now),last_error=null,uncertain_at=null where claim_id=p_claim_id;
  l := null;
  if c.source_log_id is not null then select * into l from public.sms_log where id=c.source_log_id for update; end if;
  if l.id is null and c.reminder_group_id is not null then select * into l from public.sms_log where reminder_group_id=c.reminder_group_id and reminder_group_primary order by created_at desc limit 1 for update; end if;

  if l.id is not null then
    if l.provider_message_id is not null and l.provider_message_id<>p_provider_message_id then return pg_catalog.jsonb_build_object('ok',false,'reason','log_provider_message_id_mismatch'); end if;
    update public.sms_log set
      job_id=coalesce(c.job_id,job_id),device_id=coalesce(c.device_id,device_id),client=coalesce(c.client,client),
      phone=coalesce(c.recipient_phone,phone),message=coalesce(c.message,message),provider='smsapi',
      provider_message_id=p_provider_message_id,provider_response=coalesce(p_provider_response,provider_response),
      status='provider_sent',planned_for=coalesce(planned_for,c.claimed_at),approved_at=coalesce(approved_at,c.staged_at,v_now),
      approved_by=coalesce(approved_by,c.approved_by),sent_at=coalesce(sent_at,v_now),error_message=null,
      reminder_cycle=coalesce(c.reminder_cycle,reminder_cycle),reminder_due_date=coalesce(c.reminder_due_date,reminder_due_date),
      reminder_group_id=coalesce(c.reminder_group_id,reminder_group_id),reminder_group_primary=true
    where id=l.id returning id into v_log_id;
  else
    insert into public.sms_log(job_id,device_id,client,phone,message,sms_type,provider,provider_message_id,provider_response,status,planned_for,approved_at,approved_by,sent_at,created_by,reminder_cycle,reminder_due_date,reminder_group_id,reminder_group_primary)
    values(c.job_id,c.device_id,c.client,c.recipient_phone,c.message,'service_reminder','smsapi',p_provider_message_id,p_provider_response,'provider_sent',c.claimed_at,coalesce(c.staged_at,v_now),c.approved_by,v_now,c.approved_by,c.reminder_cycle,c.reminder_due_date,c.reminder_group_id,true)
    returning id into v_log_id;
  end if;

  if v_log_id is null then raise exception 'Nie udało się utrwalić zaakceptowanej wysyłki SMS.' using errcode='55000'; end if;
  update private.sms_delivery_claims set source_log_id=v_log_id where claim_id=p_claim_id;
  if c.job_id is not null then update public.jobs set last_sms_log_id=v_log_id,last_sms_sent_at=v_now,last_sms_status='provider_sent',last_sms_error=null,sms_recipient_phone=coalesce(c.recipient_phone,sms_recipient_phone) where id=c.job_id; end if;
  return pg_catalog.jsonb_build_object('ok',true,'claim_id',p_claim_id,'log_id',v_log_id,'provider_message_id',p_provider_message_id,'status','provider_sent');
end;
$function$;

CREATE OR REPLACE FUNCTION public.reject_service_sms_claim(p_claim_id uuid, p_error text, p_provider_response jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c private.sms_delivery_claims%rowtype; l public.sms_log%rowtype; v_log_id uuid;
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then raise exception 'Dostęp wyłącznie dla funkcji wysyłającej.' using errcode='42501'; end if;
  select * into c from private.sms_delivery_claims where claim_id=p_claim_id for update;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','claim_not_found'); end if;
  if c.provider_message_id is not null or c.confirmed_at is not null then return pg_catalog.jsonb_build_object('ok',false,'reason','claim_already_confirmed'); end if;
  l := null;
  if c.source_log_id is not null then select * into l from public.sms_log where id=c.source_log_id for update; end if;
  if l.id is null and c.reminder_group_id is not null then select * into l from public.sms_log where reminder_group_id=c.reminder_group_id and reminder_group_primary order by created_at desc limit 1 for update; end if;
  if l.id is not null then
    update public.sms_log set status='error',error_message=nullif(btrim(coalesce(p_error,'')),''),provider_response=coalesce(p_provider_response,provider_response),approved_at=coalesce(approved_at,c.staged_at,now()),approved_by=coalesce(approved_by,c.approved_by) where id=l.id returning id into v_log_id;
  else
    insert into public.sms_log(job_id,device_id,client,phone,message,sms_type,provider,provider_response,status,planned_for,approved_at,approved_by,created_by,error_message,reminder_cycle,reminder_due_date,reminder_group_id,reminder_group_primary)
    values(c.job_id,c.device_id,c.client,c.recipient_phone,coalesce(c.message,''),'service_reminder','smsapi',p_provider_response,'error',c.claimed_at,coalesce(c.staged_at,now()),c.approved_by,c.approved_by,nullif(btrim(coalesce(p_error,'')),''),c.reminder_cycle,c.reminder_due_date,c.reminder_group_id,true)
    returning id into v_log_id;
  end if;
  if c.job_id is not null then update public.jobs set last_sms_log_id=v_log_id,last_sms_status='error',last_sms_error=nullif(btrim(coalesce(p_error,'')),'') where id=c.job_id; end if;
  delete from private.sms_delivery_claims where claim_id=p_claim_id;
  return pg_catalog.jsonb_build_object('ok',true,'released',true,'log_id',v_log_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_service_sms_claim_uncertain(p_claim_id uuid, p_error text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji wysyłającej.' using errcode = '42501';
  end if;

  update private.sms_delivery_claims
  set
    last_error = nullif(btrim(coalesce(p_error, '')), ''),
    uncertain_at = now()
  where claim_id = p_claim_id;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'claim_not_found');
  end if;

  return pg_catalog.jsonb_build_object('ok', true, 'claim_id', p_claim_id, 'uncertain', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_sms_delivery_atomic_v2(p_provider_message_id text, p_claim_id uuid, p_status text, p_error text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.sms_log%rowtype; c private.sms_delivery_claims%rowtype; j public.jobs%rowtype; v_rank integer; v_now timestamptz:=now(); v_recovered boolean:=false;
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then raise exception 'Dostęp wyłącznie dla webhooka SMS.' using errcode='42501'; end if;
  if nullif(btrim(coalesce(p_provider_message_id,'')),'') is null then raise exception 'missing_provider_message_id' using errcode='22023'; end if;
  if p_status not in ('provider_sent','error','delivered') then raise exception 'invalid_sms_status' using errcode='22023'; end if;
  l := null;
  select * into l from public.sms_log where provider_message_id=p_provider_message_id order by created_at desc limit 1 for update;
  if l.id is null and p_claim_id is not null then
    select * into c from private.sms_delivery_claims where claim_id=p_claim_id for update;
    if not found then return pg_catalog.jsonb_build_object('ok',false,'status',404,'error','sms_claim_not_found'); end if;
    if c.provider_message_id is not null and c.provider_message_id<>p_provider_message_id then return pg_catalog.jsonb_build_object('ok',false,'status',409,'error','claim_provider_message_id_mismatch'); end if;
    update private.sms_delivery_claims set provider_message_id=p_provider_message_id,confirmed_at=coalesce(confirmed_at,v_now),last_error=null,uncertain_at=null where claim_id=p_claim_id;
    l := null;
    if c.source_log_id is not null then select * into l from public.sms_log where id=c.source_log_id for update; end if;
    if l.id is null and c.reminder_group_id is not null then select * into l from public.sms_log where reminder_group_id=c.reminder_group_id and reminder_group_primary order by created_at desc limit 1 for update; end if;
    if l.id is not null then
      if l.provider_message_id is not null and l.provider_message_id<>p_provider_message_id then return pg_catalog.jsonb_build_object('ok',false,'status',409,'error','log_provider_message_id_mismatch'); end if;
      update public.sms_log set job_id=coalesce(c.job_id,job_id),device_id=coalesce(c.device_id,device_id),client=coalesce(c.client,client),phone=coalesce(c.recipient_phone,phone),message=coalesce(nullif(c.message,''),message),provider='smsapi',provider_message_id=p_provider_message_id,sent_at=coalesce(sent_at,v_now),approved_at=coalesce(approved_at,c.staged_at,v_now),approved_by=coalesce(approved_by,c.approved_by),reminder_cycle=coalesce(c.reminder_cycle,reminder_cycle),reminder_due_date=coalesce(c.reminder_due_date,reminder_due_date),reminder_group_id=coalesce(c.reminder_group_id,reminder_group_id),reminder_group_primary=true where id=l.id returning * into l;
    else
      if nullif(btrim(coalesce(c.message,'')),'') is null then return pg_catalog.jsonb_build_object('ok',false,'status',409,'error','claim_not_staged'); end if;
      insert into public.sms_log(job_id,device_id,client,phone,message,sms_type,provider,provider_message_id,status,planned_for,approved_at,approved_by,sent_at,created_by,reminder_cycle,reminder_due_date,reminder_group_id,reminder_group_primary)
      values(c.job_id,c.device_id,c.client,c.recipient_phone,c.message,'service_reminder','smsapi',p_provider_message_id,'provider_sent',c.claimed_at,coalesce(c.staged_at,v_now),c.approved_by,v_now,c.approved_by,c.reminder_cycle,c.reminder_due_date,c.reminder_group_id,true)
      returning * into l;
    end if;
    update private.sms_delivery_claims set source_log_id=l.id where claim_id=p_claim_id;
    v_recovered := true;
  end if;
  if l.id is null then return pg_catalog.jsonb_build_object('ok',false,'status',404,'error','sms_log_not_found'); end if;
  v_rank := private.sms_delivery_rank(p_status);
  if v_rank>private.sms_delivery_rank(l.status) then
    update public.sms_log set status=p_status,error_message=case when p_status='error' then p_error else null end,delivered_at=case when p_status='delivered' then coalesce(delivered_at,v_now) else delivered_at end where id=l.id returning * into l;
  end if;
  if l.job_id is not null then
    select * into j from public.jobs where id=l.job_id for update;
    if found and (j.last_sms_log_id=l.id or j.last_sms_sent_at is null or l.sent_at is null or l.sent_at>=j.last_sms_sent_at) then
      update public.jobs set last_sms_log_id=l.id,last_sms_sent_at=coalesce(l.sent_at,last_sms_sent_at),last_sms_status=case when v_rank>private.sms_delivery_rank(last_sms_status) then p_status else last_sms_status end,last_sms_error=case when v_rank>private.sms_delivery_rank(last_sms_status) and p_status='error' then p_error when v_rank>private.sms_delivery_rank(last_sms_status) then null else last_sms_error end where id=l.job_id;
    end if;
  end if;
  return pg_catalog.jsonb_build_object('ok',true,'providerMessageId',p_provider_message_id,'nextStatus',p_status,'logId',l.id,'recoveredFromClaim',v_recovered);
end;
$function$;


revoke all on function public.claim_service_sms_group_v2(uuid, uuid, uuid, integer) from public;
revoke all on function public.claim_service_sms_group_v2(uuid, uuid, uuid, integer) from anon;
revoke all on function public.claim_service_sms_group_v2(uuid, uuid, uuid, integer) from authenticated;
grant execute on function public.claim_service_sms_group_v2(uuid, uuid, uuid, integer) to service_role;

revoke all on function public.stage_service_sms_claim(uuid, text, uuid) from public;
revoke all on function public.stage_service_sms_claim(uuid, text, uuid) from anon;
revoke all on function public.stage_service_sms_claim(uuid, text, uuid) from authenticated;
grant execute on function public.stage_service_sms_claim(uuid, text, uuid) to service_role;

revoke all on function public.record_service_sms_acceptance(uuid, text, jsonb) from public;
revoke all on function public.record_service_sms_acceptance(uuid, text, jsonb) from anon;
revoke all on function public.record_service_sms_acceptance(uuid, text, jsonb) from authenticated;
grant execute on function public.record_service_sms_acceptance(uuid, text, jsonb) to service_role;

revoke all on function public.reject_service_sms_claim(uuid, text, jsonb) from public;
revoke all on function public.reject_service_sms_claim(uuid, text, jsonb) from anon;
revoke all on function public.reject_service_sms_claim(uuid, text, jsonb) from authenticated;
grant execute on function public.reject_service_sms_claim(uuid, text, jsonb) to service_role;

revoke all on function public.mark_service_sms_claim_uncertain(uuid, text) from public;
revoke all on function public.mark_service_sms_claim_uncertain(uuid, text) from anon;
revoke all on function public.mark_service_sms_claim_uncertain(uuid, text) from authenticated;
grant execute on function public.mark_service_sms_claim_uncertain(uuid, text) to service_role;

revoke all on function public.apply_sms_delivery_atomic_v2(text, uuid, text, text) from public;
revoke all on function public.apply_sms_delivery_atomic_v2(text, uuid, text, text) from anon;
revoke all on function public.apply_sms_delivery_atomic_v2(text, uuid, text, text) from authenticated;
grant execute on function public.apply_sms_delivery_atomic_v2(text, uuid, text, text) to service_role;
