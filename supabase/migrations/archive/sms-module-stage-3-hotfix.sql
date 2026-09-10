alter table public.sms_log
add column if not exists provider_response jsonb;
