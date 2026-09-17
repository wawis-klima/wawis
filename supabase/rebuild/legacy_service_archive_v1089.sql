-- Canonical legacy dependencies, reconstructed from read-only catalog evidence.
-- Rebuild only: load after schema + protocol table + legacy helpers, before triggers/storage/ACL.
create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
create table if not exists private.job_recycle_bin (
 archive_id uuid primary key default gen_random_uuid(), job_id uuid not null,
 deleted_at timestamptz not null default now(), deleted_by uuid,
 snapshot jsonb not null, restored_at timestamptz
);
create table if not exists private.sms_delivery_claims (
 delivery_key text primary key, claim_id uuid not null unique default gen_random_uuid(),
 claimed_at timestamptz not null default now(), provider_message_id text, confirmed_at timestamptz
);
alter table private.job_recycle_bin enable row level security;
alter table private.sms_delivery_claims enable row level security;
revoke all on private.job_recycle_bin,private.sms_delivery_claims from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.claim_service_sms(p_job_id uuid, p_device_id uuid, p_cycle integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare linked uuid:=p_job_id; source text; delivery text; claimed uuid; job public.jobs%rowtype;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Dostęp wyłącznie dla funkcji wysyłającej.' using errcode='42501'; end if;
  if p_cycle is null or p_cycle<1 or p_cycle>100 then raise exception 'Niepoprawny cykl przypomnienia.'; end if;
  if p_device_id is not null then
    select split_part(source_job_id,'::',1) into source from public.devices where id=p_device_id;
    if not found then raise exception 'Urządzenie nie istnieje.'; end if;
    if source ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      if linked is not null and linked<>source::uuid then raise exception 'Niezgodne powiązanie karty i urządzenia.'; end if;
      linked:=source::uuid;
    end if;
  end if;
  if linked is not null then
    select * into job from public.jobs where id=linked;
    if not found then raise exception 'Karta nie istnieje.'; end if;
    if not job.sms_consent or not job.sms_reminder_enabled then raise exception 'Zgoda SMS lub przypomnienia są wyłączone dla tej karty.'; end if;
    delivery:='job:'||linked::text||':cycle:'||p_cycle::text;
  elsif p_device_id is not null then delivery:='device:'||p_device_id::text||':cycle:'||p_cycle::text;
  else raise exception 'Brak karty lub urządzenia do wysyłki.'; end if;
  if exists(
    select 1 from public.sms_log l left join public.devices d on d.id=l.device_id
    where coalesce(l.reminder_cycle,1)=p_cycle
      and (l.status in ('sent','provider_sent','delivered') or l.provider_message_id is not null)
      and ((linked is not null and (l.job_id=linked or split_part(d.source_job_id,'::',1)=linked::text)) or (linked is null and l.device_id=p_device_id))
  ) then return null; end if;
  insert into private.sms_delivery_claims(delivery_key) values(delivery) on conflict do nothing returning claim_id into claimed;
  return claimed;
end $function$;
CREATE OR REPLACE FUNCTION public.confirm_service_sms(p_claim_id uuid, p_provider_message_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Brak uprawnień.' using errcode='42501'; end if;
  if nullif(trim(p_provider_message_id),'') is null then raise exception 'Brak potwierdzenia operatora.'; end if;
  update private.sms_delivery_claims set provider_message_id=p_provider_message_id,confirmed_at=now() where claim_id=p_claim_id and (provider_message_id is null or provider_message_id=p_provider_message_id);
  if not found then raise exception 'Nie znaleziono rezerwacji SMS.'; end if;
end $function$;
CREATE OR REPLACE FUNCTION private.archive_job_before_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare snap jsonb := jsonb_build_object('jobs',to_jsonb(old)); t text; rows jsonb;
begin
  foreach t in array array['job_access','comments','photos','nameplate_manual_verifications','job_protocols','job_protocol_email_log','push_delivery_log'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.%I r where job_id=$1',t) into rows using old.id;
    snap := snap || jsonb_build_object(t,rows);
  end loop;
  select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) into rows from public.devices d where d.source_job_id=old.id::text or d.source_job_id like old.id::text || '::device-%';
  snap := snap || jsonb_build_object('devices',rows);
  select coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) into rows from public.sms_log l
    where l.job_id=old.id or l.device_id in (select d.id from public.devices d where d.source_job_id=old.id::text or d.source_job_id like old.id::text || '::device-%');
  snap := snap || jsonb_build_object('sms_log',rows);
  insert into private.job_recycle_bin(job_id,deleted_by,snapshot) values(old.id,auth.uid(),snap);
  return old;
end $function$;
CREATE OR REPLACE FUNCTION public.admin_list_deleted_jobs()
 RETURNS TABLE(archive_id uuid, job_id uuid, client text, deleted_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
begin
  if not public.current_user_is_admin() then raise exception 'Tylko administrator ma dostęp do kosza.' using errcode='42501'; end if;
  return query select r.archive_id,r.job_id,r.snapshot->'jobs'->>'client',r.deleted_at from private.job_recycle_bin r where r.restored_at is null order by r.deleted_at desc;
end $function$;
CREATE OR REPLACE FUNCTION public.admin_restore_deleted_job(p_archive_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
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
end $function$;
CREATE OR REPLACE FUNCTION public.job_file_can_be_deleted(p_bucket text, p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
select auth.uid() is not null and (public.current_user_is_admin() or public.current_user_can_access_job(public.storage_object_job_id(p_path)))
and case p_bucket
when 'job-photos' then not exists(select 1 from public.photos p where p.storage_path=p_path)
 and not exists(select 1 from private.job_recycle_bin r, jsonb_array_elements(r.snapshot->'photos') p where r.restored_at is null and p->>'storage_path'=p_path)
when 'job-protocols' then not exists(select 1 from public.job_protocols p where p.storage_path=p_path)
 and not exists(select 1 from private.job_recycle_bin r, jsonb_array_elements(r.snapshot->'job_protocols') p where r.restored_at is null and p->>'storage_path'=p_path)
else false end
$function$;
-- Explicit owners and least-privilege entry points. Internal bodies retain authorization checks.
alter table private.job_recycle_bin owner to postgres;
alter table private.sms_delivery_claims owner to postgres;
alter function public.claim_service_sms(uuid,uuid,integer) owner to postgres;
alter function public.confirm_service_sms(uuid,text) owner to postgres;
alter function private.archive_job_before_delete() owner to postgres;
alter function public.admin_list_deleted_jobs() owner to postgres;
alter function public.admin_restore_deleted_job(uuid) owner to postgres;
alter function public.job_file_can_be_deleted(text,text) owner to postgres;
revoke all on function public.claim_service_sms(uuid,uuid,integer), public.confirm_service_sms(uuid,text), private.archive_job_before_delete(), public.admin_list_deleted_jobs(), public.admin_restore_deleted_job(uuid), public.job_file_can_be_deleted(text,text) from public,anon,authenticated;
grant execute on function public.claim_service_sms(uuid,uuid,integer), public.confirm_service_sms(uuid,text) to service_role;
grant execute on function public.admin_list_deleted_jobs(), public.admin_restore_deleted_job(uuid), public.job_file_can_be_deleted(text,text) to authenticated;
CREATE OR REPLACE FUNCTION public.current_user_can_edit_job(p_job_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
  select coalesce(
    public.current_user_is_staff()
    and p_job_id is not null
    and exists (
      select 1
      from public.jobs j
      where j.id = p_job_id
        and (
          public.current_user_is_admin()
          or lower(trim(coalesce(j.status, ''))) <> 'zakończone'
        )
    ),
    false
  );
$function$;
ALTER FUNCTION public.current_user_can_edit_job(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.current_user_can_edit_job(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_edit_job(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.current_user_can_finalize_job(p_job_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
  select coalesce(
    public.current_user_is_staff()
    and p_job_id is not null
    and exists (
      select 1
      from public.jobs j
      where j.id = p_job_id
        and j.status = 'Zakończone'
        and (public.current_user_is_admin() or j.completed_by = auth.uid())
    ),
    false
  );
$function$;
ALTER FUNCTION public.current_user_can_finalize_job(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.current_user_can_finalize_job(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_finalize_job(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_delete_jobs_recoverable(p_ids uuid[], p_only_unlinked boolean DEFAULT false)
 RETURNS TABLE(id uuid)
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
declare n integer;
begin
  if not public.current_user_is_admin() then raise exception 'Tylko administrator może usuwać karty.' using errcode='42501'; end if;
  return query delete from public.jobs j where j.id=any(p_ids) and (not p_only_unlinked or j.contractor_id is null) returning j.id;
  get diagnostics n = row_count;
  if n=0 then raise exception 'Nie usunięto karty. Odśwież dane i sprawdź powiązania.'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.save_job_with_access(p_id uuid, p_fields jsonb, p_viewer_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
declare saved public.jobs%rowtype; cols text; vals text; assignments text; allowed text[] := array[
'title','client','email','phone','city','street','location','status','installation_date','admin_note','main_technician_id','sms_recipient_phone','contractor_id','contractor_address_id','device_model','device_serial_number'];
begin
  if auth.uid() is null then raise exception 'Zaloguj się ponownie.' using errcode='42501'; end if;
  if jsonb_typeof(p_fields) is distinct from 'object' then raise exception 'Niepoprawne dane karty.'; end if;
  if p_id is null then
    allowed:=allowed || array['created_by','sms_consent','sms_reminder_enabled'];
    p_fields:=p_fields || jsonb_build_object('created_by',auth.uid());
    if exists(select 1 from jsonb_object_keys(p_fields) k where not k=any(allowed)) then raise exception 'Niedozwolone pole.'; end if;
    select string_agg(format('%I',k),','),string_agg(format('r.%I',k),',') into cols,vals from jsonb_object_keys(p_fields) k;
    execute format('insert into public.jobs (%s) select %s from jsonb_populate_record(null::public.jobs,$1) r returning *',cols,vals) into saved using p_fields;
  else
    if exists(select 1 from jsonb_object_keys(p_fields) k where not k=any(allowed)) then raise exception 'Niedozwolone pole.'; end if;
    select string_agg(format('%I=r.%I',k,k),',') into assignments from jsonb_object_keys(p_fields) k;
    if assignments is null then raise exception 'Brak danych do zapisu.'; end if;
    execute format('update public.jobs j set %s from jsonb_populate_record(null::public.jobs,$1) r where j.id=$2 returning j.*',assignments) into saved using p_fields,p_id;
    if saved.id is null then raise exception 'Nie zapisano karty. Brak uprawnień albo karta nie istnieje.' using errcode='42501'; end if;
  end if;
  if p_viewer_ids is not null then
    if exists(select 1 from unnest(p_viewer_ids) u where u is null or not exists(select 1 from public.profiles p where p.id=u)) then
      raise exception 'Przypisany pracownik nie istnieje.' using errcode='23503';
    end if;
    if public.current_user_is_admin() then
      delete from public.job_access a where a.job_id=saved.id and not a.user_id=any(p_viewer_ids);
      insert into public.job_access(job_id,user_id) select saved.id,u from (select distinct unnest(p_viewer_ids) u) ids where u is not null and not exists(select 1 from public.job_access a where a.job_id=saved.id and a.user_id=u);
    elsif p_id is null then
      if exists(select 1 from unnest(p_viewer_ids) u where u is distinct from auth.uid()) then raise exception 'Brak uprawnień do przypisania pracowników.' using errcode='42501'; end if;
      insert into public.job_access(job_id,user_id) select saved.id,auth.uid() where auth.uid()=any(p_viewer_ids);
    else
      raise exception 'Tylko administrator może zmieniać przypisania.' using errcode='42501';
    end if;
  end if;
  return jsonb_build_object('id',saved.id,'status',saved.status);
end $function$;
CREATE OR REPLACE FUNCTION public.admin_list_devices_basic()
 RETURNS TABLE(id uuid, contractor_id uuid, model text, serial_number text, installation_date date, status text, notes text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może pobierać listę urządzeń.' using errcode = '42501';
  end if;

  return query
  select d.id, d.contractor_id, d.model, d.serial_number, d.installation_date,
         d.status, d.notes, d.created_at, d.updated_at
  from public.devices d
  order by d.created_at desc, d.id desc;
end;
$function$;
CREATE OR REPLACE FUNCTION public.admin_list_devices_for_service()
 RETURNS TABLE(id uuid, contractor_id uuid, contractor_name text, contractor_city text, contractor_phone text, model text, serial_number text, installation_date date, status text, notes text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może pobierać urządzenia do serwisu.' using errcode = '42501';
  end if;

  return query
  select
    d.id,
    d.contractor_id,
    coalesce(c.company_name, '') as contractor_name,
    coalesce(c.city, '') as contractor_city,
    coalesce(c.phone, '') as contractor_phone,
    d.model,
    d.serial_number,
    d.installation_date,
    d.status,
    d.notes,
    d.created_at,
    d.updated_at
  from public.devices d
  left join public.contractors c on c.id = d.contractor_id
  where d.status = 'do_serwisu'
  order by d.installation_date asc nulls last, d.created_at asc, d.id asc;
end;
$function$;
CREATE OR REPLACE FUNCTION public.photo_audit_log_event(p_action text, p_job_id uuid DEFAULT NULL::uuid, p_photo_id uuid DEFAULT NULL::uuid, p_storage_path text DEFAULT NULL::text, p_image_url text DEFAULT NULL::text, p_source text DEFAULT 'app'::text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  v_id uuid;
  v_actor_id uuid := auth.uid();
  v_actor_role text := case when public.current_user_is_admin() then 'admin' else 'user' end;
begin
  if auth.uid() is not null and not public.current_user_is_admin() and p_job_id is not null and not public.current_user_can_access_job(p_job_id) then
    raise exception 'Brak dostępu do karty.' using errcode='42501';
  end if;
  insert into public.photo_audit_log (
    job_id,
    photo_id,
    actor_user_id,
    actor_role,
    action,
    source,
    storage_path,
    image_url,
    details
  )
  values (
    p_job_id,
    p_photo_id,
    v_actor_id,
    v_actor_role,
    trim(coalesce(p_action, '')),
    coalesce(nullif(trim(coalesce(p_source, '')), ''), 'app'),
    nullif(trim(coalesce(p_storage_path, '')), ''),
    nullif(trim(coalesce(p_image_url, '')), ''),
    coalesce(p_details, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Użytkownik'),
    new.email,
    'Oczekujący'
  );
  return new;
end;
$function$;
ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
