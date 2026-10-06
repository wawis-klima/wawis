-- SMS stable identity + complete jobs pagination closure / v12.57
-- SMS-02: stable customer identity wins over phone in dashboard/snapshot.
-- SMS-03 frontend pagination is implemented in shared JS; this migration keeps
-- the server-side dashboard count aligned with the same stable identity.

create or replace function private.sms_customer_key_for_target(
  p_contractor_id uuid,
  p_job_id uuid,
  p_device_id uuid,
  p_phone text
)
returns text
language sql
immutable
set search_path to ''
as $function$
  select case
    when p_contractor_id is not null then 'contractor:'||p_contractor_id::text
    when p_job_id is not null then 'job:'||p_job_id::text
    when p_device_id is not null then 'device:'||p_device_id::text
    when private.normalize_sms_phone(p_phone) is not null
      then 'phone:'||private.normalize_sms_phone(p_phone)
    else null
  end;
$function$;

revoke all on function private.sms_customer_key_for_target(uuid,uuid,uuid,text)
  from public,anon,authenticated;

create or replace function private.sms_actionable_queue_count_at(p_today date)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  with device_rows as (
    select
      d.*,
      private.sms_source_job_uuid(d.source_job_id) as source_job_uuid,
      btrim(coalesce(d.source_job_id, '')) as raw_source
    from public.devices d
  ),
  raw_targets as (
    select
      j.id as job_id,
      null::uuid as device_id,
      j.contractor_id,
      private.normalize_sms_phone(coalesce(j.sms_recipient_phone, j.phone, '')) as phone,
      j.installation_date::date as installation_date,
      greatest(1, coalesce(j.service_reminder_years, 5))::integer as reminder_years,
      j.sms_consent is true as sms_consent,
      j.sms_reminder_enabled is true as sms_enabled,
      true as source_ok
    from public.jobs j
    where not exists (
      select 1
      from device_rows d
      where d.source_job_uuid = j.id
    )

    union all

    select
      d.source_job_uuid as job_id,
      d.id as device_id,
      coalesce(d.contractor_id,j.contractor_id) as contractor_id,
      private.normalize_sms_phone(
        case
          when j.id is not null then coalesce(j.sms_recipient_phone, j.phone, '')
          else coalesce(c.phone, '')
        end
      ) as phone,
      d.installation_date::date as installation_date,
      greatest(1, coalesce(j.service_reminder_years, d.service_reminder_years, 5))::integer as reminder_years,
      case when j.id is not null then j.sms_consent is true else d.sms_consent is true end as sms_consent,
      case when j.id is not null then j.sms_reminder_enabled is true else d.sms_reminder_enabled is true end as sms_enabled,
      (d.raw_source = '' or j.id is not null) as source_ok
    from device_rows d
    left join public.jobs j on j.id = d.source_job_uuid
    left join public.contractors c on c.id = d.contractor_id
  ),
  targets as (
    select
      r.*,
      private.sms_customer_key_for_target(
        r.contractor_id,r.job_id,r.device_id,r.phone
      ) as customer_key
    from raw_targets r
  ),
  scheduled as (
    select
      t.*,
      gs.cycle,
      private.service_sms_due_date(t.installation_date, gs.cycle) as due_date
    from targets t
    cross join lateral generate_series(1, t.reminder_years) as gs(cycle)
    where t.installation_date is not null
      and t.phone is not null
      and t.customer_key is not null
      and t.sms_consent
      and t.sms_enabled
      and t.source_ok
  ),
  active as (
    select s.*
    from scheduled s
    where p_today is not null
      and s.due_date <= p_today
      and p_today <= s.due_date + 62
  ),
  actionable as (
    select a.*
    from active a
    where not exists (
      select 1
      from public.sms_log l
      left join private.sms_reminder_groups g on g.id = l.reminder_group_id
      where l.sms_type = 'service_reminder'
        and (
          lower(btrim(coalesce(l.status, ''))) in ('provider_sent', 'sent', 'delivered')
          or (
            lower(btrim(coalesce(l.status, ''))) in ('deleted', 'dismissed', 'not_sent')
            and (l.reminder_group_id is null or l.reminder_group_primary is true)
          )
        )
        and (
          (
            g.id is not null
            and g.customer_key = a.customer_key
            and a.due_date between g.anchor_due_date and g.window_end_date
          )
          or (
            g.id is null
            and private.normalize_sms_phone(l.phone) = a.phone
            and l.reminder_due_date is not null
            and abs(l.reminder_due_date - a.due_date) <= 62
            and (
              select count(distinct peer.customer_key)
              from active peer
              where peer.phone=a.phone
            ) = 1
          )
        )
    )
  )
  select count(distinct customer_key)::integer
  from actionable;
$function$;

revoke all on function private.sms_actionable_queue_count_at(date)
  from public,anon,authenticated;
grant execute on function private.sms_actionable_queue_count_at(date)
  to service_role;

create or replace function private.sms_actionable_queue_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select private.sms_actionable_queue_count_at(
    (current_timestamp at time zone 'Europe/Warsaw')::date
  );
$function$;

revoke all on function private.sms_actionable_queue_count()
  from public,anon,authenticated;
grant execute on function private.sms_actionable_queue_count()
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
           g.customer_key as reminder_group_customer_key,
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
           g.customer_key as reminder_group_customer_key,
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
           g.customer_key as reminder_group_customer_key,
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
