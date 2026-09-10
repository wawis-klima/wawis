alter table public.sms_log
  add column if not exists device_id uuid references public.devices(id) on delete cascade,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists provider_response jsonb,
  add column if not exists reminder_cycle integer,
  add column if not exists reminder_due_date date;

create index if not exists idx_sms_log_device_id_created_at
  on public.sms_log(device_id, created_at desc);

create index if not exists idx_sms_log_device_cycle
  on public.sms_log(device_id, reminder_cycle);

create or replace function public.admin_get_sms_module_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb;
  v_logs jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może odczytywać dane modułu SMS.' using errcode = '42501';
  end if;

  select to_jsonb(s)
    into v_settings
  from (
    select id, is_enabled, sending_mode, sender_name, service_phone, company_name, template_service_reminder, updated_at
    from public.sms_settings
    order by updated_at desc nulls last, created_at desc nulls last
    limit 1
  ) s;

  select coalesce(jsonb_agg(row_to_json(l) order by l.created_at desc), '[]'::jsonb)
    into v_logs
  from (
    select id, job_id, device_id, client, phone, sms_type, provider, provider_message_id, status, planned_for, approved_at, sent_at, delivered_at, error_message, reminder_cycle, reminder_due_date, created_at
    from public.sms_log
    order by created_at desc
    limit 300
  ) l;

  return jsonb_build_object(
    'settings', coalesce(v_settings, '{}'::jsonb),
    'logs', coalesce(v_logs, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.admin_get_sms_module_snapshot() to authenticated;
