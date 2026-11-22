-- każda instrukcja musi zakończyć się błędem
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', false);
set role authenticated;
select public.admin_set_user_blocked_v1476('00000000-0000-0000-0000-0000000000a1', true);
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
select public.admin_set_user_blocked_v1476('00000000-0000-0000-0000-0000000000b1', true);
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
select public.admin_list_user_logins_v1476();
select public.claim_login_notices_v1476(gen_random_uuid(), repeat('0',64));
reset role;
