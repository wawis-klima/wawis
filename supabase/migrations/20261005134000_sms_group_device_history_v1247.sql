-- SMS audit closure: device history must include customer-group attempts even when
-- another device/job was the representative row of the durable reminder group.

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
      coalesce(p_source_job_id, private.sms_source_job_uuid(d.source_job_id)) as source_job_id,
      d.installation_date::date as installation_date,
      greatest(1, coalesce(j.service_reminder_years, d.service_reminder_years, 5))::integer as reminder_years,
      private.normalize_sms_phone(
        case
          when j.id is not null then coalesce(j.sms_recipient_phone, j.phone, '')
          else coalesce(c.phone, '')
        end
      ) as normalized_phone
    from public.devices d
    left join public.jobs j
      on j.id = coalesce(p_source_job_id, private.sms_source_job_uuid(d.source_job_id))
    left join public.contractors c on c.id = d.contractor_id
    where d.id = p_device_id
  ),
  device_due_dates as (
    select
      dc.normalized_phone,
      private.service_sms_due_date(dc.installation_date, gs.cycle) as due_date
    from device_context dc
    cross join lateral generate_series(1, dc.reminder_years) as gs(cycle)
    where dc.installation_date is not null
      and dc.normalized_phone is not null
  ),
  matching_groups as (
    select distinct g.id
    from private.sms_reminder_groups g
    join device_due_dates d
      on d.normalized_phone = g.normalized_phone
     and d.due_date between g.anchor_due_date and g.window_end_date
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
  where l.device_id = p_device_id
     or (
       (select source_job_id from effective_job) is not null
       and l.job_id = (select source_job_id from effective_job)
     )
     or exists (
       select 1
       from matching_groups mg
       where mg.id = l.reminder_group_id
     )
  order by l.created_at desc
  limit 200;
end;
$function$;

revoke all on function public.admin_get_device_sms_history(uuid,uuid) from public, anon;
grant execute on function public.admin_get_device_sms_history(uuid,uuid) to authenticated, service_role;
