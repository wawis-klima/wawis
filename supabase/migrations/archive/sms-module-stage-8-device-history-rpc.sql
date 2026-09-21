create or replace function public.admin_get_device_sms_history(
  p_device_id uuid,
  p_source_job_id uuid default null
)
returns table (
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
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może odczytywać historię SMS urządzenia.' using errcode = '42501';
  end if;

  return query
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
     or (p_source_job_id is not null and l.job_id = p_source_job_id)
  order by l.created_at desc
  limit 200;
end;
$$;

grant execute on function public.admin_get_device_sms_history(uuid, uuid) to authenticated;
