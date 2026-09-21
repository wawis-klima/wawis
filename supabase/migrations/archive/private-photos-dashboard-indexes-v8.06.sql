-- v8.06: prywatny bucket zdjęć, signed URL, centralne liczniki Centrum 360 i indeksy wydajnościowe.

begin;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(trim(coalesce(p.role, ''))) in ('administrator', 'admin')
  ), false);
$$;

grant execute on function public.current_user_is_admin() to authenticated, service_role;

create or replace function public.storage_object_job_id(p_name text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when split_part(coalesce(p_name, ''), '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(coalesce(p_name, ''), '/', 1)::uuid
    else null
  end;
$$;

grant execute on function public.storage_object_job_id(text) to authenticated, service_role;

create or replace function public.current_user_can_access_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_job_id is not null
    and (
      public.current_user_is_admin()
      or exists (
        select 1
        from public.jobs j
        where j.id = p_job_id
          and (
            j.created_by = auth.uid()
            or j.main_technician_id = auth.uid()
          )
      )
      or exists (
        select 1
        from public.job_access ja
        where ja.job_id = p_job_id
          and ja.user_id = auth.uid()
      )
    ),
    false
  );
$$;

grant execute on function public.current_user_can_access_job(uuid) to authenticated, service_role;

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do update
set public = false;

alter table public.photos enable row level security;

drop policy if exists "photos_select_accessible_job" on public.photos;
create policy "photos_select_accessible_job"
on public.photos
for select
to authenticated
using (
  public.current_user_can_access_job(job_id)
  or uploaded_by = auth.uid()
);

drop policy if exists "photos_insert_accessible_job" on public.photos;
create policy "photos_insert_accessible_job"
on public.photos
for insert
to authenticated
with check (
  public.current_user_can_access_job(job_id)
  and (
    public.current_user_is_admin()
    or uploaded_by = auth.uid()
  )
);

drop policy if exists "photos_update_admin_or_owner" on public.photos;
create policy "photos_update_admin_or_owner"
on public.photos
for update
to authenticated
using (
  public.current_user_is_admin()
  or uploaded_by = auth.uid()
)
with check (
  public.current_user_is_admin()
  or uploaded_by = auth.uid()
);

drop policy if exists "photos_delete_admin_or_owner" on public.photos;
create policy "photos_delete_admin_or_owner"
on public.photos
for delete
to authenticated
using (
  public.current_user_is_admin()
  or uploaded_by = auth.uid()
  or public.current_user_can_access_job(job_id)
);

drop policy if exists "job_photos_storage_select_accessible_job" on storage.objects;
create policy "job_photos_storage_select_accessible_job"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'job-photos'
  and public.current_user_can_access_job(public.storage_object_job_id(name))
);

drop policy if exists "job_photos_storage_insert_accessible_job" on storage.objects;
create policy "job_photos_storage_insert_accessible_job"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'job-photos'
  and public.current_user_can_access_job(public.storage_object_job_id(name))
);

drop policy if exists "job_photos_storage_update_accessible_job" on storage.objects;
create policy "job_photos_storage_update_accessible_job"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'job-photos'
  and public.current_user_can_access_job(public.storage_object_job_id(name))
)
with check (
  bucket_id = 'job-photos'
  and public.current_user_can_access_job(public.storage_object_job_id(name))
);

drop policy if exists "job_photos_storage_delete_admin_or_owner" on storage.objects;
create policy "job_photos_storage_delete_admin_or_owner"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'job-photos'
  and (
    public.current_user_is_admin()
    or public.current_user_can_access_job(public.storage_object_job_id(name))
    or exists (
      select 1
      from public.photos p
      where p.storage_path = storage.objects.name
        and p.uploaded_by = auth.uid()
    )
  )
);

create index if not exists idx_jobs_installation_date on public.jobs(installation_date);
create index if not exists idx_jobs_status on public.jobs(status);
create index if not exists idx_jobs_main_technician_id on public.jobs(main_technician_id);
create index if not exists idx_jobs_contractor_id on public.jobs(contractor_id);
create index if not exists idx_job_access_user_id on public.job_access(user_id);
create index if not exists idx_job_access_job_id on public.job_access(job_id);
create index if not exists idx_photos_job_id on public.photos(job_id);
create index if not exists idx_comments_job_id on public.comments(job_id);
create index if not exists idx_sms_log_status on public.sms_log(status);
create index if not exists idx_sms_log_job_id on public.sms_log(job_id);
create index if not exists idx_sms_log_device_id on public.sms_log(device_id);
create index if not exists idx_devices_installation_date on public.devices(installation_date);
create index if not exists idx_devices_contractor_id on public.devices(contractor_id);
create index if not exists idx_devices_source_job_id on public.devices(source_job_id);

create or replace function public.admin_get_dashboard_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  select count(*)::integer
    into v_jobs_today
  from public.jobs j
  where j.installation_date is not null
    and j.installation_date::date = v_today;

  select count(*)::integer
    into v_jobs_current_week
  from public.jobs j
  where j.installation_date is not null
    and j.installation_date::date >= v_current_week_start
    and j.installation_date::date < v_current_week_end;

  select count(*)::integer
    into v_devices_without_date
  from public.devices d
  where d.installation_date is null;

  select count(*)::integer
    into v_contractors_count
  from public.admin_list_contractors() c
  where coalesce(c.is_active, true) is true;

  select count(*)::integer
    into v_clients_without_phone
  from public.admin_list_contractors() c
  where coalesce(c.is_active, true) is true
    and nullif(trim(coalesce(c.phone, '')), '') is null;

  select count(*)::integer
    into v_jobs_without_installer
  from public.jobs j
  where coalesce(j.status, '') in ('Nowe', 'W trakcie')
    and j.main_technician_id is null
    and not exists (
      select 1
      from public.job_access ja
      where ja.job_id = j.id
    );

  select count(*)::integer
    into v_sms_errors
  from public.sms_log l
  where lower(trim(coalesce(l.status, ''))) in ('error', 'failed', 'provider_error', 'błąd', 'blad');

  with device_rows as (
    select
      d.*,
      regexp_replace(coalesce(d.source_job_id, ''), '::device-[0-9]+$', '') as source_job_base_id
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
      select 1
      from device_rows d
      where d.source_job_base_id = j.id::text
    )

    union all

    select
      case
        when d.source_job_base_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then d.source_job_base_id::uuid
        else null::uuid
      end as job_id,
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
    left join public.jobs j on (
      d.source_job_base_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and j.id = d.source_job_base_id::uuid
    )
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
$$;

grant execute on function public.admin_get_dashboard_metrics() to authenticated, service_role;

commit;
