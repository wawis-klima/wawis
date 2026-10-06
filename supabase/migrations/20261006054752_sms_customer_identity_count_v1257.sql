-- WAWIS 12.57 / SMS-02
-- Licznik kolejki SMS używa trwałej tożsamości klienta zamiast numeru telefonu.
-- Telefon pozostaje wyłącznie fallbackiem dla starych, niepowiązanych wpisów sms_log.

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
      case
        when j.contractor_id is not null then 'contractor:' || j.contractor_id::text
        else 'job:' || j.id::text
      end as customer_key,
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
      case
        when d.contractor_id is not null then 'contractor:' || d.contractor_id::text
        when j.contractor_id is not null then 'contractor:' || j.contractor_id::text
        when j.id is not null then 'job:' || j.id::text
        else 'device:' || d.id::text
      end as customer_key,
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
  scheduled as (
    select
      t.*,
      gs.cycle,
      private.service_sms_due_date(t.installation_date, gs.cycle) as due_date
    from raw_targets t
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
  log_rows as (
    select
      l.*,
      g.anchor_due_date as group_anchor_due_date,
      g.window_end_date as group_window_end_date,
      case
        when g.customer_key is not null then g.customer_key
        when lj.contractor_id is not null then 'contractor:' || lj.contractor_id::text
        when l.job_id is not null then 'job:' || l.job_id::text
        when ld.contractor_id is not null then 'contractor:' || ld.contractor_id::text
        when ldj.contractor_id is not null then 'contractor:' || ldj.contractor_id::text
        when ldj.id is not null then 'job:' || ldj.id::text
        when l.device_id is not null then 'device:' || l.device_id::text
        else null
      end as customer_key
    from public.sms_log l
    left join private.sms_reminder_groups g on g.id = l.reminder_group_id
    left join public.jobs lj on lj.id = l.job_id
    left join public.devices ld on ld.id = l.device_id
    left join public.jobs ldj on ldj.id = private.sms_source_job_uuid(ld.source_job_id)
    where l.sms_type = 'service_reminder'
  ),
  actionable as (
    select a.*
    from active a
    where not exists (
      select 1
      from log_rows l
      where (
        lower(btrim(coalesce(l.status, ''))) in ('provider_sent', 'sent', 'delivered')
        or (
          lower(btrim(coalesce(l.status, ''))) in ('deleted', 'dismissed', 'not_sent')
          and (l.reminder_group_id is null or l.reminder_group_primary is true)
        )
      )
      and (
        (
          l.reminder_group_id is not null
          and l.customer_key = a.customer_key
          and a.due_date between l.group_anchor_due_date and l.group_window_end_date
        )
        or (
          l.reminder_group_id is null
          and l.reminder_due_date is not null
          and abs(l.reminder_due_date - a.due_date) <= 62
          and (
            (l.customer_key is not null and l.customer_key = a.customer_key)
            or (
              l.customer_key is null
              and private.normalize_sms_phone(l.phone) = a.phone
            )
          )
        )
      )
    )
  )
  select count(distinct customer_key)::integer
  from actionable;
$function$;

revoke all on function private.sms_actionable_queue_count_at(date) from public, anon, authenticated;
grant execute on function private.sms_actionable_queue_count_at(date) to service_role;
