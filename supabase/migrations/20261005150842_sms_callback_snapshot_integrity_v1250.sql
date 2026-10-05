-- SMS v12.50 / N-01: callback-first musi utrwalać pełny staged snapshot próby.
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

revoke all on function public.apply_sms_delivery_atomic_v2(text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.apply_sms_delivery_atomic_v2(text,uuid,text,text) to service_role;
