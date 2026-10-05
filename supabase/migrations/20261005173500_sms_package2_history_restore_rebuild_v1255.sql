-- SMS Package 2 / v12.55
-- N-04, P2-01, P2-08 and P3-01 support: legacy restore normalization,
-- paginated complete history and deterministic rebuild parity.

create or replace function public.admin_restore_deleted_job(p_archive_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  r private.job_recycle_bin%rowtype;
  t text;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może przywracać karty.' using errcode='42501';
  end if;

  select *
  into r
  from private.job_recycle_bin
  where archive_id=p_archive_id
    and restored_at is null
  for update;

  if not found then
    raise exception 'Karta została już przywrócona albo wpis nie istnieje.';
  end if;

  insert into public.jobs
  select *
  from jsonb_populate_record(
    null::public.jobs,
    (r.snapshot->'jobs') || pg_catalog.jsonb_build_object('status','W trakcie')
  );

  -- The insert trigger regenerates derived devices; restore their original identities.
  delete from public.devices
  where source_job_id=r.job_id::text
     or source_job_id like r.job_id::text || '::device-%';

  foreach t in array array[
    'devices','job_access','comments','photos',
    'nameplate_manual_verifications','job_protocols','job_protocol_email_log'
  ] loop
    execute format(
      'insert into public.%I select * from jsonb_populate_recordset(null::public.%I,$1)',
      t,t
    )
    using coalesce(r.snapshot->t,'[]'::jsonb);
  end loop;

  -- SMS history survives operational deletion. Insert only rows that are genuinely
  -- absent (legacy archives); never duplicate or overwrite an existing audit row.
  insert into public.sms_log(
    id,job_id,client,phone,message,sms_type,provider,provider_message_id,status,
    planned_for,sent_at,delivered_at,error_message,created_by,created_at,
    approved_at,approved_by,provider_response,reminder_for_date,service_cycle_number,
    reminder_cycle,reminder_due_date,device_id,reminder_group_id,
    reminder_group_primary,retry_of_log_id
  )
  select
    (x->>'id')::uuid,
    nullif(x->>'job_id','')::uuid,
    x->>'client',
    x->>'phone',
    x->>'message',
    coalesce(nullif(x->>'sms_type',''),'service_reminder'),
    coalesce(nullif(x->>'provider',''),'smsapi'),
    nullif(x->>'provider_message_id',''),
    coalesce(nullif(x->>'status',''),'queued'),
    nullif(x->>'planned_for','')::timestamptz,
    nullif(x->>'sent_at','')::timestamptz,
    nullif(x->>'delivered_at','')::timestamptz,
    x->>'error_message',
    nullif(x->>'created_by','')::uuid,
    coalesce(nullif(x->>'created_at','')::timestamptz,now()),
    nullif(x->>'approved_at','')::timestamptz,
    nullif(x->>'approved_by','')::uuid,
    case
      when x ? 'provider_response' and x->'provider_response' <> 'null'::jsonb
        then x->'provider_response'
      else null
    end,
    nullif(x->>'reminder_for_date','')::date,
    nullif(x->>'service_cycle_number','')::integer,
    nullif(x->>'reminder_cycle','')::integer,
    nullif(x->>'reminder_due_date','')::date,
    nullif(x->>'device_id','')::uuid,
    nullif(x->>'reminder_group_id','')::uuid,
    coalesce(nullif(x->>'reminder_group_primary','')::boolean,false),
    nullif(x->>'retry_of_log_id','')::uuid
  from jsonb_array_elements(coalesce(r.snapshot->'sms_log','[]'::jsonb)) x
  on conflict (id) do nothing;

  -- Older archives predate durable membership. Re-create it when enough identity
  -- survives in the restored log/device/job, without overwriting existing history.
  insert into private.sms_reminder_group_members(
    reminder_group_id,device_id,job_id,contractor_id,reminder_due_date,membership_source
  )
  select distinct
    l.reminder_group_id,
    l.device_id,
    l.job_id,
    coalesce(d.contractor_id,j.contractor_id),
    coalesce(l.reminder_due_date,g.anchor_due_date),
    'restore'
  from jsonb_array_elements(coalesce(r.snapshot->'sms_log','[]'::jsonb)) x
  join public.sms_log l on l.id=(x->>'id')::uuid
  join private.sms_reminder_groups g on g.id=l.reminder_group_id
  left join public.devices d on d.id=l.device_id
  left join public.jobs j on j.id=l.job_id
  where l.reminder_group_id is not null
    and (l.device_id is not null or l.job_id is not null)
  on conflict do nothing;

  update public.push_delivery_log
  set job_id=r.job_id
  where id in(
    select (x->>'id')::uuid
    from jsonb_array_elements(r.snapshot->'push_delivery_log') x
  );

  update public.jobs
  set status=r.snapshot->'jobs'->>'status'
  where id=r.job_id;

  update public.jobs
  set completed_at=(r.snapshot->'jobs'->>'completed_at')::timestamptz,
      completed_by=(r.snapshot->'jobs'->>'completed_by')::uuid
  where id=r.job_id;

  update private.job_recycle_bin
  set restored_at=now()
  where archive_id=r.archive_id;

  return r.job_id;
end;
$function$;

create or replace function public.admin_get_device_sms_history(
  p_device_id uuid,
  p_source_job_id uuid default null::uuid
)
returns table(
  id uuid,
  job_id uuid,
  device_id uuid,
  client text,
  phone text,
  status text,
  error_message text,
  created_at timestamptz,
  planned_for timestamptz,
  approved_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  reminder_cycle integer,
  reminder_due_date date
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role'
     and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może odczytywać historię SMS urządzenia.'
      using errcode='42501';
  end if;

  return query
  with device_context as (
    select
      d.id as device_id,
      coalesce(p_source_job_id,private.sms_source_job_uuid(d.source_job_id)) as source_job_id
    from public.devices d
    where d.id=p_device_id
  ),
  matching_groups as (
    select distinct m.reminder_group_id
    from private.sms_reminder_group_members m
    cross join device_context dc
    where m.device_id=p_device_id
       or (dc.source_job_id is not null and m.job_id=dc.source_job_id)
  ),
  effective_job as (
    select source_job_id
    from device_context
    limit 1
  )
  select
    l.id,
    l.job_id,
    l.device_id,
    l.client,
    l.phone,
    l.status,
    l.error_message,
    l.created_at,
    l.planned_for,
    l.approved_at,
    l.sent_at,
    l.delivered_at,
    l.reminder_cycle,
    l.reminder_due_date
  from public.sms_log l
  where l.device_id=p_device_id
     or (
       (select source_job_id from effective_job) is not null
       and l.job_id=(select source_job_id from effective_job)
     )
     or exists (
       select 1
       from matching_groups mg
       where mg.reminder_group_id=l.reminder_group_id
     )
  order by l.created_at desc,l.id desc;
end;
$function$;


create or replace function public.admin_get_sms_history_page(
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),100);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_total bigint;
  v_rows jsonb;
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role'
     and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może odczytywać pełną historię SMS.'
      using errcode='42501';
  end if;

  select count(*) into v_total from public.sms_log;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb)
  into v_rows
  from (
    select
      l.id,l.job_id,l.device_id,l.client,l.phone,l.sms_type,l.provider,
      l.provider_message_id,l.status,l.planned_for,l.approved_at,l.sent_at,
      l.delivered_at,l.error_message,l.reminder_cycle,l.reminder_due_date,
      l.reminder_group_id,l.reminder_group_primary,l.retry_of_log_id,
      g.anchor_due_date as reminder_group_anchor_date,
      g.window_end_date as reminder_group_window_end_date,
      l.created_at
    from public.sms_log l
    left join private.sms_reminder_groups g on g.id=l.reminder_group_id
    order by l.created_at desc,l.id desc
    limit v_limit offset v_offset
  ) x;

  return jsonb_build_object(
    'rows',coalesce(v_rows,'[]'::jsonb),
    'total',v_total,
    'limit',v_limit,
    'offset',v_offset,
    'has_more',v_offset+jsonb_array_length(coalesce(v_rows,'[]'::jsonb))<v_total
  );
end;
$function$;

revoke all on function public.admin_get_sms_history_page(integer,integer)
  from public,anon;
grant execute on function public.admin_get_sms_history_page(integer,integer)
  to authenticated,service_role;

create or replace function public.admin_get_device_sms_history_page(
  p_device_id uuid,
  p_source_job_id uuid default null::uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),100);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_total bigint;
  v_rows jsonb;
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role'
     and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może odczytywać historię SMS urządzenia.'
      using errcode='42501';
  end if;

  with device_context as (
    select d.id as device_id,
           coalesce(p_source_job_id,private.sms_source_job_uuid(d.source_job_id)) as source_job_id
    from public.devices d where d.id=p_device_id
  ),
  matching_groups as (
    select distinct m.reminder_group_id
    from private.sms_reminder_group_members m
    cross join device_context dc
    where m.device_id=p_device_id
       or (dc.source_job_id is not null and m.job_id=dc.source_job_id)
  ),
  effective_job as (
    select source_job_id from device_context limit 1
  ),
  matched as (
    select l.*
    from public.sms_log l
    where l.device_id=p_device_id
       or ((select source_job_id from effective_job) is not null
           and l.job_id=(select source_job_id from effective_job))
       or exists (
         select 1 from matching_groups mg
         where mg.reminder_group_id=l.reminder_group_id
       )
  )
  select count(*) into v_total from matched;

  with device_context as (
    select d.id as device_id,
           coalesce(p_source_job_id,private.sms_source_job_uuid(d.source_job_id)) as source_job_id
    from public.devices d where d.id=p_device_id
  ),
  matching_groups as (
    select distinct m.reminder_group_id
    from private.sms_reminder_group_members m
    cross join device_context dc
    where m.device_id=p_device_id
       or (dc.source_job_id is not null and m.job_id=dc.source_job_id)
  ),
  effective_job as (
    select source_job_id from device_context limit 1
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb)
  into v_rows
  from (
    select
      l.id,l.job_id,l.device_id,l.client,l.phone,l.sms_type,l.provider,
      l.provider_message_id,l.status,l.planned_for,l.approved_at,l.sent_at,
      l.delivered_at,l.error_message,l.reminder_cycle,l.reminder_due_date,
      l.reminder_group_id,l.reminder_group_primary,l.retry_of_log_id,l.created_at
    from public.sms_log l
    where l.device_id=p_device_id
       or ((select source_job_id from effective_job) is not null
           and l.job_id=(select source_job_id from effective_job))
       or exists (
         select 1 from matching_groups mg
         where mg.reminder_group_id=l.reminder_group_id
       )
    order by l.created_at desc,l.id desc
    limit v_limit offset v_offset
  ) x;

  return jsonb_build_object(
    'rows',coalesce(v_rows,'[]'::jsonb),
    'total',v_total,
    'limit',v_limit,
    'offset',v_offset,
    'has_more',v_offset+jsonb_array_length(coalesce(v_rows,'[]'::jsonb))<v_total
  );
end;
$function$;

revoke all on function public.admin_get_device_sms_history_page(uuid,uuid,integer,integer)
  from public,anon;
grant execute on function public.admin_get_device_sms_history_page(uuid,uuid,integer,integer)
  to authenticated,service_role;


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

  -- Full history is loaded through paginated RPCs only when the user opens it.
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


create or replace function public.admin_cleanup_sms_duplicate_logs()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(auth.role(),'')<>'service_role'
     and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może uruchomić kontrolę duplikatów logów SMS.'
      using errcode='42501';
  end if;

  return jsonb_build_object(
    'ok',true,
    'skipped',true,
    'reason','history_protection_stage1',
    'deleted_duplicate_logs',0,
    'physical_delete_disabled',true,
    'successful_send_history_preserved',true
  );
end;
$function$;

alter function public.guard_job_sms_runtime_columns() set search_path = '';
alter function public.claim_service_sms(uuid,uuid,integer) set search_path = 'public','pg_temp';
alter function public.confirm_service_sms(uuid,text) set search_path = 'public','pg_temp';

