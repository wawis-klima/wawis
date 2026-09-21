-- Moduł SMS etap 7: cykle przypomnień, 2-miesięczne okno aktywności i historia statusów niewysłano/usunięto.

alter table public.jobs
  add column if not exists service_reminder_years integer not null default 5;

update public.jobs
set service_reminder_years = 5
where service_reminder_years is null or service_reminder_years <= 0;

alter table public.jobs
  drop constraint if exists jobs_service_reminder_years_check;
alter table public.jobs
  add constraint jobs_service_reminder_years_check
  check (service_reminder_years between 1 and 10);

alter table public.sms_log
  add column if not exists reminder_cycle integer,
  add column if not exists reminder_due_date date;

update public.sms_log l
set
  reminder_cycle = coalesce(l.reminder_cycle, 1),
  reminder_due_date = coalesce(l.reminder_due_date, j.service_due_date)
from public.jobs j
where l.job_id = j.id
  and (l.reminder_cycle is null or l.reminder_due_date is null);

update public.sms_log
set reminder_cycle = coalesce(reminder_cycle, 1)
where reminder_cycle is null;

create index if not exists idx_sms_log_job_cycle_due
on public.sms_log(job_id, reminder_cycle, reminder_due_date, created_at desc);

create index if not exists idx_sms_log_status_due
on public.sms_log(status, reminder_due_date, created_at desc);

drop index if exists uq_sms_log_active_service_reminder;
create unique index if not exists uq_sms_log_active_service_reminder_cycle
on public.sms_log(job_id, sms_type, reminder_cycle, reminder_due_date)
where status in ('pending_approval', 'approved', 'sent', 'provider_sent', 'delivered');

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
    select
      id,
      job_id,
      client,
      phone,
      sms_type,
      provider,
      provider_message_id,
      status,
      planned_for,
      sent_at,
      delivered_at,
      error_message,
      approved_at,
      created_at,
      reminder_cycle,
      reminder_due_date
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
