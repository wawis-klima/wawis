-- WAWIS Klimatyzacja v9.87
-- Historia firmowej wysyłki podpisanych protokołów PDF z biuro@wawis.pl.
-- Uruchomić po setup-job-protocols-v9.79.sql i setup-job-payment-confirmation-v9.86.sql.
-- Skrypt jest idempotentny i może zostać bezpiecznie uruchomiony ponownie.

begin;

create table if not exists public.job_protocol_email_log (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  job_id uuid not null references public.jobs(id) on delete cascade,
  protocol_id uuid not null references public.job_protocols(id) on delete cascade,
  recipient_email text not null,
  sender_email text not null default 'biuro@wawis.pl',
  provider text not null default 'resend',
  provider_message_id text,
  provider_response jsonb,
  status text not null default 'sending',
  error_message text,
  sent_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint job_protocol_email_log_status_check
    check (status in ('sending', 'sent', 'failed')),
  constraint job_protocol_email_log_recipient_check
    check (recipient_email = lower(recipient_email) and length(recipient_email) between 3 and 254),
  constraint job_protocol_email_log_sender_check
    check (sender_email = 'biuro@wawis.pl')
);

comment on table public.job_protocol_email_log is
  'Historia serwerowej wysyłki podpisanych protokołów z firmowego adresu biuro@wawis.pl.';
comment on column public.job_protocol_email_log.request_key is
  'Unikalny identyfikator próby używany także jako klucz idempotencji dostawcy poczty.';

create index if not exists job_protocol_email_log_job_created_idx
  on public.job_protocol_email_log (job_id, created_at desc);
create index if not exists job_protocol_email_log_protocol_created_idx
  on public.job_protocol_email_log (protocol_id, created_at desc);
create index if not exists job_protocol_email_log_sender_created_idx
  on public.job_protocol_email_log (sent_by, created_at desc);

alter table public.job_protocol_email_log enable row level security;

grant usage on schema public to authenticated, service_role;
revoke all on table public.job_protocol_email_log from anon, authenticated;
grant select on table public.job_protocol_email_log to authenticated;
grant select, insert, update, delete on table public.job_protocol_email_log to service_role;

drop policy if exists "job_protocol_email_log_select_accessible_job" on public.job_protocol_email_log;
create policy "job_protocol_email_log_select_accessible_job"
on public.job_protocol_email_log
for select
to authenticated
using (public.current_user_can_access_job(job_id));

commit;
