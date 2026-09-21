-- Wawis 9.27
-- 1) szybka synchronizacja tylko jednego montażu po zatwierdzeniu tabliczki
-- 2) bezpieczne parsowanie source_job_id w dashboardzie (bez castowania pustego tekstu do UUID)

create or replace function public.admin_sync_device_from_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_job record;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może synchronizować urządzenia.' using errcode = '42501';
  end if;

  select id, contractor_id, device_model, device_serial_number, installation_date
  into v_job
  from public.jobs
  where id = p_job_id;

  if not found then
    raise exception 'Nie znaleziono montażu %.', p_job_id using errcode = 'P0002';
  end if;

  perform public.sync_device_from_job_row(
    v_job.id::text,
    v_job.contractor_id,
    v_job.device_model,
    v_job.device_serial_number,
    v_job.installation_date
  );

  return jsonb_build_object('synced', true, 'job_id', p_job_id);
end;
$function$;

grant execute on function public.admin_sync_device_from_job(uuid) to authenticated;

create or replace function public.admin_get_dashboard_metrics()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today date := current_date;
  v_current_week_start date := date_trunc('week', current_date::timestamp)::date;
  v_current_week_end date := (date_trunc('week', current_date::timestamp)::date + 7);
  v_jobs_today integer := 0;
  v_jobs_current_week integer := 0;
  v_sms_due_today integer := 0;
  v_devices_without_date integer := 0;
  v_contractors_count integer := 0;
  v_clients_without_phone integer := 0;
  v_jobs_without_installer integer := 0;
  v_sms_errors integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może pobierać liczniki Centrum 360.' using errcode = '42501';
  end if;

  select count(*)::integer into v_jobs_today
  from public.jobs j
  where j.installation_date is not null
    and j.installation_date::date = v_today;

  select count(*)::integer into v_jobs_current_week
  from public.jobs j
  where j.installation_date is not null
    and j.installation_date::date >= v_current_week_start
    and j.installation_date::date < v_current_week_end;

  select count(*)::integer into v_devices_without_date
  from public.devices d
  where d.installation_date is null;

  select count(*)::integer into v_contractors_count
  from public.admin_list_contractors() c
  where coalesce(c.is_active, true) is true;

  select count(*)::integer into v_clients_without_phone
  from public.admin_list_contractors() c
  where coalesce(c.is_active, true) is true
    and nullif(trim(coalesce(c.phone, '')), '') is null;

  select count(*)::integer into v_jobs_without_installer
  from public.jobs j
  where coalesce(j.status, '') in ('Nowe', 'W trakcie')
    and j.main_technician_id is null
    and not exists (
      select 1 from public.job_access ja where ja.job_id = j.id
    );

  select count(*)::integer into v_sms_errors
  from public.sms_log l
  where lower(trim(coalesce(l.status, ''))) in ('error', 'failed', 'provider_error', 'błąd', 'blad');

  with device_rows as (
    select
      d.*,
      regexp_replace(coalesce(d.source_job_id, ''), '::device-[0-9]+$', '') as source_job_base_id,
      case
        when regexp_replace(coalesce(d.source_job_id, ''), '::device-[0-9]+$', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then regexp_replace(coalesce(d.source_job_id, ''), '::device-[0-9]+$', '')::uuid
        else null::uuid
      end as source_job_uuid
    from public.devices d
  ), raw_targets as (
    select
      j.id as job_id,
      null::uuid as device_id,
      coalesce(j.client, j.title, '') as client,
      coalesce(j.sms_recipient_phone, j.phone, '') as phone,
      coalesce(j.contractor_id::text, '') as contractor_id,
      coalesce(j.city, '') as city,
      coalesce(j.street, '') as street,
      j.installation_date::date as installation_date,
      greatest(1, least(coalesce(j.service_reminder_years, 5), 10)) as reminder_years,
      coalesce(j.sms_consent, false) as sms_consent,
      coalesce(j.sms_reminder_enabled, true) as sms_reminder_enabled
    from public.jobs j
    where not exists (
      select 1 from device_rows d where d.source_job_uuid = j.id
    )

    union all

    select
      d.source_job_uuid as job_id,
      d.id as device_id,
      coalesce(c.company_name, j.client, j.title, '') as client,
      coalesce(j.sms_recipient_phone, j.phone, c.phone, '') as phone,
      coalesce(d.contractor_id::text, j.contractor_id::text, '') as contractor_id,
      coalesce(c.city, j.city, '') as city,
      coalesce(c.street, j.street, '') as street,
      coalesce(d.installation_date::date, j.installation_date::date) as installation_date,
      greatest(1, least(coalesce(d.service_reminder_years, j.service_reminder_years, 5), 10)) as reminder_years,
      coalesce(j.sms_consent, true) as sms_consent,
      coalesce(j.sms_reminder_enabled, true) as sms_reminder_enabled
    from device_rows d
    left join public.contractors c on c.id = d.contractor_id
    left join public.jobs j on j.id = d.source_job_uuid
  ), due_targets as (
    select
      t.*,
      gs.cycle,
      (t.installation_date + ((case when gs.cycle = 1 then 11 else 11 + ((gs.cycle - 1) * 12) end)::text || ' months')::interval)::date as reminder_due_date
    from raw_targets t
    cross join lateral generate_series(1, t.reminder_years) as gs(cycle)
    where t.installation_date is not null
      and t.sms_consent is true
      and t.sms_reminder_enabled is true
      and nullif(regexp_replace(coalesce(t.phone, ''), '\D+', '', 'g'), '') is not null
  ), active_targets as (
    select *
    from due_targets d
    where d.reminder_due_date <= v_today
      and v_today <= d.reminder_due_date + 62
      and not exists (
        select 1
        from public.sms_log l
        where lower(trim(coalesce(l.status, ''))) in ('provider_sent', 'sent', 'delivered', 'deleted', 'not_sent', 'wysłane', 'wyslane', 'doręczono', 'doreczono', 'usunięte', 'usuniete', 'niewysłane', 'niewyslane')
          and coalesce(l.reminder_cycle, 1) = d.cycle
          and (
            (d.job_id is not null and l.job_id = d.job_id)
            or (d.device_id is not null and l.device_id = d.device_id)
          )
      )
  )
  select count(distinct (
    coalesce(
      nullif(regexp_replace(coalesce(phone, ''), '\D+', '', 'g'), ''),
      nullif(contractor_id, ''),
      lower(trim(coalesce(client, '') || '|' || coalesce(city, '') || '|' || coalesce(street, '')))
    ) || '|due:' || reminder_due_date::text || '|cycle:' || cycle::text
  ))::integer
  into v_sms_due_today
  from active_targets;

  return jsonb_build_object(
    'jobs_today', coalesce(v_jobs_today, 0),
    'jobs_current_week', coalesce(v_jobs_current_week, 0),
    'jobs_next_7_days', coalesce(v_jobs_current_week, 0),
    'sms_due_today', coalesce(v_sms_due_today, 0),
    'devices_without_date', coalesce(v_devices_without_date, 0),
    'contractors_count', coalesce(v_contractors_count, 0),
    'clients_without_phone', coalesce(v_clients_without_phone, 0),
    'jobs_without_installer', coalesce(v_jobs_without_installer, 0),
    'sms_errors', coalesce(v_sms_errors, 0),
    'generated_at', timezone('utc', now())
  );
end;
$function$;

grant execute on function public.admin_get_dashboard_metrics() to authenticated, service_role;
