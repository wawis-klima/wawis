\set A '00000000-0000-0000-0000-0000000000a1'
\set W '00000000-0000-0000-0000-0000000000b1'
select 'baseline|' || count(*) filter (where baseline and notified_at is not null) from private.login_session_notices_v1476;
select 'cron|' || count(*) from cron.job where jobname = 'wawis-login-notify-v1476';
select 'run_idle|' || private.run_login_notify_v1476();
insert into auth.sessions (user_id, user_agent) values (:'W', 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0');
select 'run_new|' || private.run_login_notify_v1476();
select 'run_again|' || private.run_login_notify_v1476();
select 'net_calls|' || count(*) from net.calls where url like '%/functions/v1/notify-new-login' and body->>'eventType' = 'login_notice_v1476';
-- funkcja Edge (service_role) przyjmuje zadanie
select body->>'runId' as run_id, body->>'token' as run_token from net.calls order by id desc limit 1 \gset
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
set role service_role;
select 'claim_bad|' || coalesce(public.claim_login_notices_v1476(:'run_id'::uuid, repeat('0',64))::text, 'null');
select public.claim_login_notices_v1476(:'run_id'::uuid, :'run_token') as claimed \gset
select 'claim_ok|' || jsonb_array_length(:'claimed'::jsonb);
select 'claim_who|' || replace(:'claimed'::jsonb->0->>'fullName', ' ', '_');
select 'claim_replay|' || (public.claim_login_notices_v1476(:'run_id'::uuid, :'run_token') is null);
reset role;
select 'pending_after|' || count(*) from private.login_session_notices_v1476 where notified_at is null;
-- administrator z kodem, sesja aal2
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', false);
set role authenticated;
select 'list_users|' || jsonb_array_length(public.admin_list_user_logins_v1476());
select 'list_worker_sessions|' || jsonb_array_length((select u->'sessions' from jsonb_array_elements(public.admin_list_user_logins_v1476()) u where u->>'userId' = '00000000-0000-0000-0000-0000000000b1'));
select 'block|' || (public.admin_set_user_blocked_v1476(:'W', true)->>'sessionsEnded');
select 'list_blocked|' || ((select u->>'blocked' from jsonb_array_elements(public.admin_list_user_logins_v1476()) u where u->>'userId' = '00000000-0000-0000-0000-0000000000b1'));
reset role;
select 'banned|' || (banned_until > now() + interval '50 years') from auth.users where id = :'W';
select 'worker_sessions|' || count(*) from auth.sessions where user_id = :'W';
select 'block_log|' || count(*) from private.user_access_block_log_v1476 where blocked;
-- zablokowany pracownik (token jeszcze ważny)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
select 'W_blocked_mfa_ok|' || public.current_user_mfa_ok();
select 'W_blocked_jobs|' || count(*) from public.jobs;
select 'W_blocked_staff|' || public.current_user_is_staff();
reset role;
-- odblokowanie
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', false);
set role authenticated;
select 'unblock|' || (public.admin_set_user_blocked_v1476(:'W', false)->>'blocked');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
select 'W_after_jobs|' || count(*) from public.jobs;
reset role;
select 'unbanned|' || (banned_until is null) from auth.users where id = :'W';
