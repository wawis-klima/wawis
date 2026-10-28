-- WAWIS 13.89: trwały, jednoznaczny zapis ręcznej wysyłki protokołu serwisowego.
create table public.service_visit_protocol_email_log (
 id uuid primary key default gen_random_uuid(),
 request_key uuid not null unique,
 service_visit_id uuid not null references public.service_visits(id),
 protocol_id uuid not null references public.service_visit_protocols(id),
 recipient_email text not null,
 sender_email text not null default 'biuro@wawis.pl',
 status text not null check(status in ('sending','sent','error')),
 provider_message_id text,
 sent_by uuid not null references auth.users(id),
 sent_at timestamptz,
 error_message text,
 created_at timestamptz not null default now(),
 constraint service_visit_protocol_email_recipient_length check(length(recipient_email)<=254)
);
create index service_visit_protocol_email_visit_idx on public.service_visit_protocol_email_log(service_visit_id,created_at desc);
alter table public.service_visit_protocol_email_log enable row level security;
create policy service_visit_protocol_email_admin_read on public.service_visit_protocol_email_log
 for select to authenticated using ((select public.current_user_is_admin()));
revoke all on public.service_visit_protocol_email_log from anon,authenticated;
grant select on public.service_visit_protocol_email_log to authenticated;
-- INSERT i UPDATE wyłącznie z Edge Function posiadającej service-role, po potwierdzonej sesji admina.
