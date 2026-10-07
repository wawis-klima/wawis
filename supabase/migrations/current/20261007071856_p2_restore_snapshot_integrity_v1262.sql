create or replace function private.job_recycle_snapshot_integrity_ok(p_snapshot jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $function$
declare
  t text;
  expected_count integer;
  actual_count integer;
begin
  if p_snapshot is null then
    return false;
  end if;

  -- Legacy archives created before v12.62 do not have the integrity envelope.
  if not (p_snapshot ? '_integrity') then
    return true;
  end if;
  if pg_catalog.jsonb_typeof(p_snapshot->'_integrity') <> 'object' then
    return false;
  end if;

  foreach t in array array[
    'job_access','comments','photos','nameplate_manual_verifications',
    'job_protocols','job_protocol_email_log','push_delivery_log','devices','sms_log'
  ] loop
    if not ((p_snapshot->'_integrity') ? t) then
      return false;
    end if;
    if pg_catalog.jsonb_typeof(coalesce(p_snapshot->t, '[]'::jsonb)) <> 'array' then
      return false;
    end if;
    begin
      expected_count := (p_snapshot->'_integrity'->>t)::integer;
    exception when others then
      return false;
    end;
    actual_count := pg_catalog.jsonb_array_length(coalesce(p_snapshot->t, '[]'::jsonb));
    if expected_count is distinct from actual_count then
      return false;
    end if;
  end loop;

  return true;
end
$function$;

alter function private.job_recycle_snapshot_integrity_ok(jsonb) owner to postgres;
revoke all on function private.job_recycle_snapshot_integrity_ok(jsonb) from public, anon, authenticated;

create or replace function private.archive_job_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  snap jsonb := pg_catalog.jsonb_build_object('jobs', pg_catalog.to_jsonb(old));
  t text;
  rows jsonb;
begin
  foreach t in array array[
    'job_access','comments','photos','nameplate_manual_verifications',
    'job_protocols','job_protocol_email_log','push_delivery_log'
  ] loop
    execute pg_catalog.format(
      'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.%I r where job_id=$1',
      t
    ) into rows using old.id;
    snap := snap || pg_catalog.jsonb_build_object(t, rows);
  end loop;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d)), '[]'::jsonb)
    into rows
    from public.devices d
   where d.source_job_id = old.id::text
      or d.source_job_id like old.id::text || '::device-%';
  snap := snap || pg_catalog.jsonb_build_object('devices', rows);

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l)), '[]'::jsonb)
    into rows
    from public.sms_log l
   where l.job_id = old.id
      or l.device_id in (
        select d.id
        from public.devices d
        where d.source_job_id = old.id::text
           or d.source_job_id like old.id::text || '::device-%'
      );
  snap := snap || pg_catalog.jsonb_build_object('sms_log', rows);

  snap := snap || pg_catalog.jsonb_build_object(
    '_integrity',
    pg_catalog.jsonb_build_object(
      'job_access', pg_catalog.jsonb_array_length(coalesce(snap->'job_access','[]'::jsonb)),
      'comments', pg_catalog.jsonb_array_length(coalesce(snap->'comments','[]'::jsonb)),
      'photos', pg_catalog.jsonb_array_length(coalesce(snap->'photos','[]'::jsonb)),
      'nameplate_manual_verifications', pg_catalog.jsonb_array_length(coalesce(snap->'nameplate_manual_verifications','[]'::jsonb)),
      'job_protocols', pg_catalog.jsonb_array_length(coalesce(snap->'job_protocols','[]'::jsonb)),
      'job_protocol_email_log', pg_catalog.jsonb_array_length(coalesce(snap->'job_protocol_email_log','[]'::jsonb)),
      'push_delivery_log', pg_catalog.jsonb_array_length(coalesce(snap->'push_delivery_log','[]'::jsonb)),
      'devices', pg_catalog.jsonb_array_length(coalesce(snap->'devices','[]'::jsonb)),
      'sms_log', pg_catalog.jsonb_array_length(coalesce(snap->'sms_log','[]'::jsonb))
    )
  );

  insert into private.job_recycle_bin(job_id, deleted_by, snapshot)
  values (old.id, auth.uid(), snap);

  return old;
end
$function$;

alter function private.archive_job_before_delete() owner to postgres;

alter table private.job_recycle_bin
  drop constraint if exists job_recycle_bin_snapshot_integrity_chk;

alter table private.job_recycle_bin
  add constraint job_recycle_bin_snapshot_integrity_chk
  check (private.job_recycle_snapshot_integrity_ok(snapshot))
  not valid;

alter table private.job_recycle_bin
  validate constraint job_recycle_bin_snapshot_integrity_chk;
