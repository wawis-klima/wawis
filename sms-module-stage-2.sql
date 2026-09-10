-- Moduł SMS etap 2: kolejka do zatwierdzenia + tryb automatyczny jako opcja.

alter table public.sms_settings
  add column if not exists sending_mode text not null default 'approval';

update public.sms_settings
set sending_mode = coalesce(sending_mode, 'approval')
where true;

alter table public.sms_log
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id);

create index if not exists idx_sms_log_status_created_at on public.sms_log(status, created_at desc);
create index if not exists idx_sms_log_job_id_type on public.sms_log(job_id, sms_type);

create unique index if not exists uq_sms_log_active_service_reminder
on public.sms_log(job_id, sms_type)
where status in ('pending_approval', 'approved', 'sent', 'delivered');

alter table public.sms_settings drop constraint if exists sms_settings_sending_mode_check;
alter table public.sms_settings
  add constraint sms_settings_sending_mode_check
  check (sending_mode in ('approval', 'auto'));

comment on column public.sms_settings.sending_mode is 'approval = buduje kolejkę do zatwierdzenia, auto = po wygenerowaniu wysyła od razu';
comment on column public.sms_log.approved_at is 'Data zatwierdzenia do wysyłki lub automatycznego zaakceptowania.';
comment on column public.sms_log.approved_by is 'Użytkownik, który zatwierdził wysyłkę z kolejki.';
