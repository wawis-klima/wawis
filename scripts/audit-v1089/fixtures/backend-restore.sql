-- Run only on the freshly rebuilt disposable fixture. Rolled back locally.
begin;
create or replace function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create or replace function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role')$$;
insert into auth.users(id,email,raw_user_meta_data) values('00000000-0000-4000-8000-000000000001','audit@example.invalid','{"role":"Administrator"}');
do $$begin if (select role from profiles where id='00000000-0000-4000-8000-000000000001') <> 'Oczekujący' then raise exception 'metadata role escalation';end if;end$$;
update profiles set role='Administrator' where id='00000000-0000-4000-8000-000000000001';
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role='authenticated';
insert into contractors(id,company_name) values('00000000-0000-4000-8000-000000000002','Audit fixture');
insert into jobs(id,contractor_id,client,status,device_model,created_by) values('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','Audit fixture','W trakcie','Split','00000000-0000-4000-8000-000000000001');
insert into photos(job_id,photo_kind,device_index,unit_ref,storage_path) values
('00000000-0000-4000-8000-000000000003','nameplate',1,'jz','00000000-0000-4000-8000-000000000003/jz.jpg'),
('00000000-0000-4000-8000-000000000003','nameplate',1,'jw-1','00000000-0000-4000-8000-000000000003/jw.jpg');
insert into comments(job_id,author_id,text) values('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','history');
insert into job_access(job_id,user_id) values('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001');
update jobs set status='Zakończone' where id='00000000-0000-4000-8000-000000000003';
update jobs set completed_at='2025-01-02T03:04:05Z' where id='00000000-0000-4000-8000-000000000003';
insert into job_protocols(job_id,storage_path,file_name,file_size_bytes,signed_at,created_by) values('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003/protocol.pdf','protocol.pdf',3,now(),'00000000-0000-4000-8000-000000000001');
insert into devices(contractor_id,model,serial_number,source_job_id) values('00000000-0000-4000-8000-000000000002','Audit','AUDIT-HISTORY','00000000-0000-4000-8000-000000000003::device-1');
insert into sms_log(job_id,phone,message) values('00000000-0000-4000-8000-000000000003','000','audit history');
select public.admin_delete_jobs_recoverable(array['00000000-0000-4000-8000-000000000003'::uuid],false);
select public.admin_restore_deleted_job(archive_id) from private.job_recycle_bin where job_id='00000000-0000-4000-8000-000000000003';
do $$begin
 if (select status from jobs where id='00000000-0000-4000-8000-000000000003') <> 'Zakończone' then raise exception 'restore status';end if;
 if (select count(*) from photos where job_id='00000000-0000-4000-8000-000000000003') <> 2 then raise exception 'restore photos';end if;
 if (select count(*) from comments where job_id='00000000-0000-4000-8000-000000000003') <> 1 then raise exception 'restore comments';end if;
 if (select count(*) from job_protocols where job_id='00000000-0000-4000-8000-000000000003') <> 1 then raise exception 'restore protocol';end if;
 if (select count(*) from job_access where job_id='00000000-0000-4000-8000-000000000003') <> 1 then raise exception 'restore access history';end if;
 if (select count(*) from devices where source_job_id='00000000-0000-4000-8000-000000000003::device-1') <> 1 then raise exception 'restore device history';end if;
 if (select count(*) from sms_log where job_id='00000000-0000-4000-8000-000000000003') <> 1 then raise exception 'restore SMS history';end if;
 if (select completed_at from jobs where id='00000000-0000-4000-8000-000000000003') <> '2025-01-02T03:04:05Z'::timestamptz then raise exception 'restore historical timestamp';end if;
end$$;
select public.admin_delete_jobs_recoverable(array['00000000-0000-4000-8000-000000000003'::uuid],false);
do $$declare aid uuid; original jsonb; begin
 select archive_id,snapshot into aid,original from private.job_recycle_bin where job_id='00000000-0000-4000-8000-000000000003' and restored_at is null;
 update private.job_recycle_bin set snapshot=jsonb_set(snapshot,'{photos}',(snapshot->'photos') - 0) where archive_id=aid;
 begin
  perform public.admin_restore_deleted_job(aid);
  raise exception 'incomplete restore unexpectedly accepted';
 exception when check_violation then null;
 end;
 if exists(select 1 from jobs where id='00000000-0000-4000-8000-000000000003') then raise exception 'failed restore left partial job';end if;
 if exists(select 1 from private.job_recycle_bin where archive_id=aid and restored_at is not null) then raise exception 'failed restore consumed archive';end if;
 update private.job_recycle_bin set snapshot=original where archive_id=aid;
 perform public.admin_restore_deleted_job(aid);
end$$;
rollback;
