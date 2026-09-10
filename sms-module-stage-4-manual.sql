alter table public.sms_log
add column if not exists provider_response jsonb;

create index if not exists sms_log_provider_message_id_idx
on public.sms_log(provider_message_id);
