-- SMS audit follow-up: jeden lekki licznik kolejki dla Centrum 360,
-- zgodny z aktualnymi regułami modułu SMS bez ładowania pełnego snapshotu.
-- Uwzględnia: kalendarzowe daty, aktualny telefon/zgodę, 62 dni,
-- trwałe grupy klienta oraz kanoniczne miękkie statusy końcowe.

create or replace function private.sms_actionable_queue_count()
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
    -- Montaże bez zsynchronizowanego urządzenia nadal są targetem SMS.
    select
      j.id as job_id,
      null::uuid as device_id,
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

    -- Urządzenia: dla powiązanego montażu źródłem telefonu i zgody jest montaż;
    -- legacy bez source_job_id używa kontrahenta i własnych flag urządzenia.
    select
      d.source_job_uuid as job_id,
      d.id as device_id,
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
      and t.sms_consent
      and t.sms_enabled
      and t.source_ok
  ),
  active as (
    select s.*
    from scheduled s
    where s.due_date <= (current_timestamp at time zone 'Europe/Warsaw')::date
      and (current_timestamp at time zone 'Europe/Warsaw')::date <= s.due_date + 62
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
          -- Faktyczna próba przyjęta przez operatora zawsze finalizuje okno.
          lower(btrim(coalesce(l.status, ''))) in ('provider_sent', 'sent', 'delivered')
          or (
            -- deleted/dismissed/not_sent blokują tylko jako kanoniczny primary.
            -- Stary secondary nie może ukryć nowszego pending primary.
            lower(btrim(coalesce(l.status, ''))) in ('deleted', 'dismissed', 'not_sent')
            and (l.reminder_group_id is null or l.reminder_group_primary is true)
          )
        )
        and (
          (
            g.id is not null
            and g.normalized_phone = a.phone
            and a.due_date between g.anchor_due_date and g.window_end_date
          )
          or (
            g.id is null
            and private.normalize_sms_phone(l.phone) = a.phone
            and l.reminder_due_date is not null
            and abs(l.reminder_due_date - a.due_date) <= 62
          )
        )
    )
  )
  -- Wszystkie aktywne terminy mieszczą się w tym samym 62-dniowym przedziale
  -- względem "dzisiaj", więc dla jednego telefonu tworzą jedną aktywną grupę klienta.
  select count(distinct phone)::integer
  from actionable;
$function$;

revoke all on function private.sms_actionable_queue_count() from public, anon, authenticated;
grant execute on function private.sms_actionable_queue_count() to service_role;

create or replace function public.admin_get_dashboard_metrics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := (current_timestamp at time zone 'Europe/Warsaw')::date;
  v_current_week_start date := date_trunc('week', (current_timestamp at time zone 'Europe/Warsaw'))::date;
  v_current_week_end date := date_trunc('week', (current_timestamp at time zone 'Europe/Warsaw'))::date + 7;
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

  v_sms_due_today := private.sms_actionable_queue_count();

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

revoke all on function public.admin_get_dashboard_metrics() from public, anon;
grant execute on function public.admin_get_dashboard_metrics() to authenticated, service_role;
