do $$
declare signature text; table_name text;
begin
 foreach signature in array array['public.claim_service_sms(uuid,uuid,integer)','public.confirm_service_sms(uuid,text)','private.archive_job_before_delete()','public.admin_list_deleted_jobs()','public.admin_restore_deleted_job(uuid)','public.job_file_can_be_deleted(text,text)','public.current_user_can_edit_job(uuid)','public.current_user_can_finalize_job(uuid)','public.admin_delete_jobs_recoverable(uuid[],boolean)','public.save_job_with_access(uuid,jsonb,uuid[])','public.apply_sms_delivery_atomic(text,text,text)'] loop
  if to_regprocedure(signature) is null then raise exception 'missing required function %',signature; end if;
  if has_function_privilege('anon',signature,'EXECUTE') then raise exception 'unexpected anon execute %',signature; end if;
 end loop;
 if has_schema_privilege('authenticated','private','USAGE') then raise exception 'private schema exposed'; end if;
 if has_function_privilege('authenticated','public.apply_sms_delivery_atomic(text,text,text)','EXECUTE') then raise exception 'callback RPC exposed'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) then raise exception 'public table without RLS'; end if;
 if not exists(select 1 from pg_trigger where tgname='archive_job_before_delete') then raise exception 'missing archive trigger';end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and policyname='retained_job_files_delete') then raise exception 'missing retained file policy';end if;
end $$;
