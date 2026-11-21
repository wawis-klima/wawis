-- funkcje z własnym sprawdzaniem roli — administrator aal1 musi dostać błąd
create or replace function pg_temp.as_user(sub text, aal text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', sub, 'aal', aal)::text, true); end $$;
begin; set local role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1','aal1');
select public.save_job_contractor_nip('00000000-0000-0000-0000-00000000c001','1');
rollback;
begin; set local role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1','aal1');
select public.worker_create_or_get_contractor_for_job('X');
rollback;
begin; set local role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1','aal1');
insert into public.jobs(contractor_id) values (null);
rollback;
