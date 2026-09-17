CREATE OR REPLACE FUNCTION public.admin_restore_deleted_job(p_archive_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r private.job_recycle_bin%rowtype; t text;
begin
  if not public.current_user_is_admin() then raise exception 'Tylko administrator może przywracać karty.' using errcode='42501'; end if;
  select * into r from private.job_recycle_bin where archive_id=p_archive_id and restored_at is null for update;
  if not found then raise exception 'Karta została już przywrócona albo wpis nie istnieje.'; end if;
  insert into public.jobs select * from jsonb_populate_record(null::public.jobs,r.snapshot->'jobs');
  -- The insert trigger regenerates derived devices; restore their original identities.
  delete from public.devices where source_job_id=r.job_id::text or source_job_id like r.job_id::text || '::device-%';
  foreach t in array array['devices','job_access','comments','photos','nameplate_manual_verifications','job_protocols','job_protocol_email_log','sms_log'] loop
    execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I,$1)',t,t) using coalesce(r.snapshot->t,'[]'::jsonb);
  end loop;
  update public.push_delivery_log set job_id=r.job_id where id in(select (x->>'id')::uuid from jsonb_array_elements(r.snapshot->'push_delivery_log') x);
  update public.jobs set completed_at=(r.snapshot->'jobs'->>'completed_at')::timestamptz, completed_by=(r.snapshot->'jobs'->>'completed_by')::uuid where id=r.job_id;
  update private.job_recycle_bin set restored_at=now() where archive_id=r.archive_id;
  return r.job_id;
end $function$

