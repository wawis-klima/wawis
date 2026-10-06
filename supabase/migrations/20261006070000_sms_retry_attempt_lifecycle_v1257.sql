-- SMS lifecycle closure / v12.57
-- SMS-01: allow another retry after a later provider-confirmed failure.
-- SMS-06: jobs.last_sms_* always describes the newest provider attempt,
-- while status ordering remains monotonic inside the same attempt.

create or replace function private.sms_log_blocks_retry(
  p_status text,
  p_provider_message_id text,
  p_sent_at timestamptz,
  p_delivered_at timestamptz
)
returns boolean
language sql
immutable
set search_path to ''
as $function$
  select case
    when lower(btrim(coalesce(p_status,''))) in ('sent','provider_sent','delivered') then true
    when private.sms_log_is_retryable_failure(
      p_status,p_provider_message_id,p_sent_at,p_delivered_at
    ) then false
    when nullif(btrim(coalesce(p_provider_message_id,'')),'') is not null
      or p_sent_at is not null
      or p_delivered_at is not null then true
    else false
  end;
$function$;

revoke all on function private.sms_log_blocks_retry(text,text,timestamptz,timestamptz)
  from public,anon,authenticated;

create or replace function private.remember_job_sms_send()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Queue-only/pre-provider rows are not a provider attempt yet.
  if new.job_id is null
     or (
       nullif(btrim(coalesce(new.provider_message_id,'')),'') is null
       and new.sent_at is null
       and new.delivered_at is null
     ) then
    return new;
  end if;

  update public.jobs j
  set last_sms_log_id=new.id,
      last_sms_sent_at=coalesce(new.sent_at,new.delivered_at,j.last_sms_sent_at),
      last_sms_status=new.status,
      last_sms_error=case
        when lower(btrim(coalesce(new.status,'')))='error' then new.error_message
        else null
      end,
      sms_recipient_phone=coalesce(nullif(btrim(new.phone),''),j.sms_recipient_phone)
  where j.id=new.job_id
    and (
      j.last_sms_log_id=new.id
      or j.last_sms_log_id is null
      or j.last_sms_sent_at is null
      or coalesce(new.sent_at,new.delivered_at,new.created_at)
         >= coalesce(j.last_sms_sent_at,'-infinity'::timestamptz)
    );

  return new;
end;
$function$;

revoke all on function private.remember_job_sms_send()
  from public,anon,authenticated;

drop trigger if exists remember_job_sms_send on public.sms_log;
create trigger remember_job_sms_send
after insert or update of provider_message_id,sent_at,delivered_at,status,error_message
on public.sms_log
for each row execute function private.remember_job_sms_send();

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
        return pg_catalog.jsonb_build_object(
          'ok',false,'reason','missing_linked_job_consent',
          'message','Urządzenie ma nieprawidłowe powiązanie z kartą klienta.'
        );
      end if;

      select * into j from public.jobs where id=v_source_job;
      if not found then
        return pg_catalog.jsonb_build_object('ok',false,'reason','job_not_found');
      end if;

      if j.sms_consent is not true or j.sms_reminder_enabled is not true then
        return pg_catalog.jsonb_build_object(
          'ok',false,'reason','sms_disabled',
          'message','Zgoda SMS lub przypomnienia są obecnie wyłączone.'
        );
      end if;

      v_job_id := j.id;
      v_phone := private.normalize_sms_phone(
        coalesce(nullif(btrim(j.sms_recipient_phone),''),j.phone)
      );
      v_client := coalesce(
        nullif(btrim(j.client),''),
        nullif(btrim(j.title),''),
        'Kliencie'
      );
      if v_installation_date is null then
        v_installation_date := j.installation_date;
      end if;
    else
      if d.sms_consent is not true or d.sms_reminder_enabled is not true then
        return pg_catalog.jsonb_build_object(
          'ok',false,'reason','sms_disabled',
          'message','Zgoda SMS lub przypomnienia dla tego urządzenia są wyłączone.'
        );
      end if;

      if d.contractor_id is null then
        return pg_catalog.jsonb_build_object('ok',false,'reason','missing_legacy_contractor');
      end if;

      select * into c from public.contractors where id=d.contractor_id;
      if not found then
        return pg_catalog.jsonb_build_object('ok',false,'reason','contractor_not_found');
      end if;

      v_phone := private.normalize_sms_phone(c.phone);
      v_client := coalesce(
        nullif(btrim(c.company_name),''),
        nullif(btrim(c.contact_person),''),
        'Kliencie'
      );
      v_job_id := null;
    end if;
  elsif l.job_id is not null then
    select * into j from public.jobs where id=l.job_id;
    if not found then
      return pg_catalog.jsonb_build_object('ok',false,'reason','job_not_found');
    end if;

    if j.sms_consent is not true or j.sms_reminder_enabled is not true then
      return pg_catalog.jsonb_build_object(
        'ok',false,'reason','sms_disabled',
        'message','Zgoda SMS lub przypomnienia są obecnie wyłączone.'
      );
    end if;

    v_job_id := j.id;
    v_phone := private.normalize_sms_phone(
      coalesce(nullif(btrim(j.sms_recipient_phone),''),j.phone)
    );
    v_client := coalesce(
      nullif(btrim(j.client),''),
      nullif(btrim(j.title),''),
      'Kliencie'
    );
    v_installation_date := j.installation_date;
  else
    return pg_catalog.jsonb_build_object(
      'ok',false,'reason','missing_current_source',
      'message','Nie można potwierdzić aktualnych danych klienta dla tego starego wpisu.'
    );
  end if;

  if v_phone is null then
    return pg_catalog.jsonb_build_object(
      'ok',false,'reason','invalid_current_phone',
      'message','Aktualny numer telefonu klienta nie jest prawidłowym polskim numerem.'
    );
  end if;

  v_due_date := coalesce(
    l.reminder_due_date,
    private.service_sms_due_date(v_installation_date,v_cycle)
  );
  if v_due_date is null then
    return pg_catalog.jsonb_build_object('ok',false,'reason','missing_reminder_due_date');
  end if;

  v_group_id := private.ensure_sms_reminder_group_for_member(
    v_phone,v_due_date,l.device_id,v_job_id
  );

  -- Only a successful or genuinely uncertain sibling attempt blocks another retry.
  -- Previous provider-confirmed failures remain in history but are retryable.
  if exists (
    select 1
    from public.sms_log s
    where s.reminder_group_id=v_group_id
      and s.id<>l.id
      and private.sms_log_blocks_retry(
        s.status,s.provider_message_id,s.sent_at,s.delivered_at
      )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'reason','group_already_sent','reminder_group_id',v_group_id
    );
  end if;

  v_delivery_key := 'retry-not-sent:' || p_log_id::text;

  insert into private.sms_delivery_claims(
    delivery_key,reminder_group_id,source_log_id,retry_of_log_id,
    job_id,device_id,recipient_phone,reminder_cycle,reminder_due_date,client
  )
  values(
    v_delivery_key,v_group_id,null,p_log_id,
    v_job_id,l.device_id,v_phone,v_cycle,v_due_date,v_client
  )
  on conflict do nothing
  returning claim_id into v_claim_id;

  if v_claim_id is null then
    return pg_catalog.jsonb_build_object(
      'ok',false,'reason','retry_claim_exists','reminder_group_id',v_group_id
    );
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

revoke all on function public.claim_service_sms_not_sent_retry(uuid)
  from public,anon,authenticated;
grant execute on function public.claim_service_sms_not_sent_retry(uuid)
  to service_role;

create or replace function public.admin_get_sms_module_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.row_to_json(x) order by x.created_at desc),
    '[]'::jsonb
  )
  into v_queue_logs
  from (
    select l.id,l.job_id,l.device_id,l.client,l.phone,l.sms_type,l.provider,l.provider_message_id,
           l.status,l.planned_for,l.approved_at,l.sent_at,l.delivered_at,l.error_message,l.reminder_cycle,
           l.reminder_due_date,l.reminder_group_id,l.reminder_group_primary,l.retry_of_log_id,
           g.anchor_due_date as reminder_group_anchor_date,
           g.window_end_date as reminder_group_window_end_date,l.created_at
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
    pg_catalog.jsonb_agg(
      pg_catalog.row_to_json(x)
      order by coalesce(x.sent_at,x.approved_at,x.created_at) desc
    ),
    '[]'::jsonb
  )
  into v_sent_this_month_logs
  from (
    select l.id,l.job_id,l.device_id,l.client,l.phone,l.sms_type,l.provider,l.provider_message_id,
           l.status,l.planned_for,l.approved_at,l.sent_at,l.delivered_at,l.error_message,l.reminder_cycle,
           l.reminder_due_date,l.reminder_group_id,l.reminder_group_primary,l.retry_of_log_id,
           g.anchor_due_date as reminder_group_anchor_date,
           g.window_end_date as reminder_group_window_end_date,l.created_at
    from public.sms_log l
    left join private.sms_reminder_groups g on g.id=l.reminder_group_id
    where lower(btrim(coalesce(l.status,''))) in ('sent','provider_sent','delivered')
      and (coalesce(l.sent_at,l.approved_at,l.created_at) at time zone 'Europe/Warsaw')::date >= v_month_start
      and (coalesce(l.sent_at,l.approved_at,l.created_at) at time zone 'Europe/Warsaw')::date < v_next_month
  ) x;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.row_to_json(x)
      order by x.reminder_due_date desc,x.created_at desc
    ),
    '[]'::jsonb
  )
  into v_unsent_logs
  from (
    select l.id,l.job_id,l.device_id,l.client,l.phone,l.sms_type,l.provider,l.provider_message_id,
           l.status,l.planned_for,l.approved_at,l.sent_at,l.delivered_at,l.error_message,l.reminder_cycle,
           l.reminder_due_date,l.reminder_group_id,l.reminder_group_primary,l.retry_of_log_id,
           g.anchor_due_date as reminder_group_anchor_date,
           g.window_end_date as reminder_group_window_end_date,l.created_at
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
          and private.sms_log_blocks_retry(
            s.status,s.provider_message_id,s.sent_at,s.delivered_at
          )
      )
    order by l.reminder_due_date desc,l.created_at desc
  ) x;

  v_history_logs := '[]'::jsonb;

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

revoke all on function public.admin_get_sms_module_snapshot()
  from public,anon;
grant execute on function public.admin_get_sms_module_snapshot()
  to authenticated,service_role;
