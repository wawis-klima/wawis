-- Intentional security deltas after historical ACL replay.
revoke all on schema private from public,anon,authenticated;
revoke all on private.job_recycle_bin,private.sms_delivery_claims from public,anon,authenticated;
revoke all on function public.claim_service_sms(uuid,uuid,integer),public.confirm_service_sms(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_service_sms(uuid,uuid,integer),public.confirm_service_sms(uuid,text) to service_role;
revoke all on function public.admin_list_deleted_jobs(),public.admin_restore_deleted_job(uuid),public.job_file_can_be_deleted(text,text),public.admin_delete_jobs_recoverable(uuid[],boolean),public.save_job_with_access(uuid,jsonb,uuid[]) from public,anon;
grant execute on function public.admin_list_deleted_jobs(),public.admin_restore_deleted_job(uuid),public.job_file_can_be_deleted(text,text),public.admin_delete_jobs_recoverable(uuid[],boolean),public.save_job_with_access(uuid,jsonb,uuid[]) to authenticated;
