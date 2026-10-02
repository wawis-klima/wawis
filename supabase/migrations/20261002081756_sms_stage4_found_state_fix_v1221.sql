-- Produkcyjny hotfix Etapu 4:
-- nie używaj PL/pgSQL FOUND jako stanu rekordu po pominiętym SELECT.
-- Jawnie sprawdzamy l.id IS NULL / IS NOT NULL.

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

revoke all on function public.record_service_sms_acceptance(uuid, text, jsonb) from public;
revoke all on function public.record_service_sms_acceptance(uuid, text, jsonb) from anon;
revoke all on function public.record_service_sms_acceptance(uuid, text, jsonb) from authenticated;
grant execute on function public.record_service_sms_acceptance(uuid, text, jsonb) to service_role;

revoke all on function public.reject_service_sms_claim(uuid, text, jsonb) from public;
revoke all on function public.reject_service_sms_claim(uuid, text, jsonb) from anon;
revoke all on function public.reject_service_sms_claim(uuid, text, jsonb) from authenticated;
grant execute on function public.reject_service_sms_claim(uuid, text, jsonb) to service_role;

revoke all on function public.apply_sms_delivery_atomic_v2(text, uuid, text, text) from public;
revoke all on function public.apply_sms_delivery_atomic_v2(text, uuid, text, text) from anon;
revoke all on function public.apply_sms_delivery_atomic_v2(text, uuid, text, text) from authenticated;
grant execute on function public.apply_sms_delivery_atomic_v2(text, uuid, text, text) to service_role;
