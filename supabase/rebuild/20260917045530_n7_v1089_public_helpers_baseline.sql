-- WAWIS 10.89 / N7 stage B / rebuild-only public helpers baseline.

CREATE OR REPLACE FUNCTION public.calculate_service_due_date(installation_date date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when installation_date is null then null
    else (installation_date + interval '11 months')::date
  end;
$function$;

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(trim(coalesce(p.role, ''))) in ('administrator', 'admin')
  ), false);
$function$;

CREATE OR REPLACE FUNCTION public.normalize_contractors_text(input_text text)
 RETURNS text LANGUAGE sql IMMUTABLE AS $function$
  select regexp_replace(lower(trim(coalesce(input_text, ''))), '\s+', ' ', 'g');
$function$;
CREATE OR REPLACE FUNCTION public.normalize_contractors_email(input_email text)
 RETURNS text LANGUAGE sql IMMUTABLE AS $function$
  select nullif(lower(trim(coalesce(input_email, ''))), '');
$function$;
CREATE OR REPLACE FUNCTION public.normalize_contractors_nip(input_nip text)
 RETURNS text LANGUAGE sql IMMUTABLE AS $function$
  select nullif(regexp_replace(coalesce(input_nip, ''), '\D+', '', 'g'), '');
$function$;
CREATE OR REPLACE FUNCTION public.normalize_contractors_phone(input_phone text)
 RETURNS text LANGUAGE sql IMMUTABLE AS $function$
  select nullif(regexp_replace(coalesce(input_phone, ''), '\D+', '', 'g'), '');
$function$;

CREATE OR REPLACE FUNCTION public.enforce_contractors_no_duplicates()
 RETURNS trigger LANGUAGE plpgsql AS $function$
declare v_existing_id uuid;
begin
  new.company_name := trim(coalesce(new.company_name, ''));
  if new.company_name = '' then raise exception 'Nazwa kontrahenta jest wymagana'; end if;
  select c.id into v_existing_id from public.contractors c
  where public.normalize_contractors_text(c.company_name)=public.normalize_contractors_text(new.company_name)
    and (tg_op='INSERT' or c.id<>new.id) limit 1;
  if v_existing_id is not null then
    raise exception 'Kontrahent o tej nazwie już istnieje w bazie. Wybierz istniejący wpis zamiast tworzyć duplikat.'
      using errcode='23505', detail='Duplikat kontrahenta: '||new.company_name,
      hint='Otwórz moduł Kontrahenci i wyszukaj istniejący wpis.';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_contractors_contact_duplicates()
 RETURNS trigger LANGUAGE plpgsql AS $function$
declare v_conflict_name text; v_conflict_value text; v_conflict_company text;
begin
  new.company_name := trim(coalesce(new.company_name, ''));
  if new.company_name = '' then raise exception 'Nazwa kontrahenta jest wymagana'; end if;
  select 'nazwa',new.company_name,c.company_name into v_conflict_name,v_conflict_value,v_conflict_company
  from public.contractors c where public.normalize_contractors_text(c.company_name)=public.normalize_contractors_text(new.company_name)
    and (tg_op='INSERT' or c.id<>new.id) limit 1;
  if v_conflict_name is null and public.normalize_contractors_email(new.email) is not null then
    select 'email',new.email,c.company_name into v_conflict_name,v_conflict_value,v_conflict_company
    from public.contractors c where public.normalize_contractors_email(c.email)=public.normalize_contractors_email(new.email)
      and (tg_op='INSERT' or c.id<>new.id) limit 1;
  end if;
  if v_conflict_name is null and public.normalize_contractors_phone(new.phone) is not null then
    select 'telefon',new.phone,c.company_name into v_conflict_name,v_conflict_value,v_conflict_company
    from public.contractors c where public.normalize_contractors_phone(c.phone)=public.normalize_contractors_phone(new.phone)
      and (tg_op='INSERT' or c.id<>new.id) limit 1;
  end if;
  if v_conflict_name is null and public.normalize_contractors_nip(new.nip) is not null then
    select 'NIP',new.nip,c.company_name into v_conflict_name,v_conflict_value,v_conflict_company
    from public.contractors c where public.normalize_contractors_nip(c.nip)=public.normalize_contractors_nip(new.nip)
      and (tg_op='INSERT' or c.id<>new.id) limit 1;
  end if;
  if v_conflict_name is not null then
    raise exception 'Kontrahent już istnieje w bazie — duplikat po polu: %.',v_conflict_name
      using errcode='23505', detail=format('Konflikt: %s = %s; istniejący wpis: %s',v_conflict_name,coalesce(v_conflict_value,'—'),coalesce(v_conflict_company,'bez nazwy')),
      hint='Otwórz istniejącego kontrahenta albo popraw dane przed zapisem.';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_jobs_use_existing_contractor()
 RETURNS trigger LANGUAGE plpgsql AS $function$
declare v_existing_id uuid; v_client text;
begin
  if tg_op not in ('INSERT','UPDATE') then return new; end if;
  v_client:=trim(coalesce(new.client,''));
  if v_client='' or new.contractor_id is not null then return new; end if;
  select c.id into v_existing_id from public.contractors c
  where public.normalize_contractors_text(c.company_name)=public.normalize_contractors_text(v_client) limit 1;
  if v_existing_id is not null then
    raise exception 'Taki klient już istnieje w bazie kontrahentów. Wybierz go z listy zamiast wpisywać ręcznie.'
      using errcode='23505', detail='Istniejący contractor_id: '||v_existing_id::text,
      hint='W formularzu montażu użyj pola wyboru kontrahenta z bazy.';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_job_sms_runtime_columns()
 RETURNS trigger LANGUAGE plpgsql AS $function$
begin
  if coalesce(auth.role(),'')='service_role' then return new; end if;
  if (new.last_sms_sent_at is distinct from old.last_sms_sent_at or new.last_sms_status is distinct from old.last_sms_status or new.last_sms_error is distinct from old.last_sms_error)
     and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może zmieniać techniczne pola statusu SMS.' using errcode='42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_contractor_addresses(input_addresses jsonb, fallback_city text DEFAULT NULL::text, fallback_street text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public' AS $function$
declare result jsonb;
begin
  with raw_addresses as (
    select ordinality, coalesce(nullif(trim(item->>'id'),''),gen_random_uuid()::text) id,
      nullif(trim(item->>'label'),'') label,nullif(trim(item->>'city'),'') city,nullif(trim(item->>'street'),'') street,
      nullif(trim(item->>'notes'),'') notes,lower(coalesce(item->>'is_primary','false')) in ('true','1','yes') requested_primary
    from jsonb_array_elements(case when jsonb_typeof(input_addresses)='array' then input_addresses else '[]'::jsonb end) with ordinality as rows(item,ordinality)
  ), valid_addresses as (select * from raw_addresses where city is not null or street is not null),
  primary_choice as (select coalesce(min(ordinality) filter(where requested_primary),min(ordinality)) primary_ordinality from valid_addresses)
  select jsonb_agg(jsonb_build_object('id',address.id,'label',coalesce(address.label,case when address.ordinality=choice.primary_ordinality then 'Adres główny' else 'Adres '||address.ordinality::text end),'city',coalesce(address.city,''),'street',coalesce(address.street,''),'notes',coalesce(address.notes,''),'is_primary',address.ordinality=choice.primary_ordinality) order by address.ordinality)
  into result from valid_addresses address cross join primary_choice choice;
  if result is null and (nullif(trim(coalesce(fallback_city,'')),'') is not null or nullif(trim(coalesce(fallback_street,'')),'') is not null) then
    result:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'label','Adres główny','city',coalesce(nullif(trim(coalesce(fallback_city,'')),''),''),'street',coalesce(nullif(trim(coalesce(fallback_street,'')),''),''),'notes','','is_primary',true));
  end if;
  return coalesce(result,'[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.photo_audit_photos_change_trigger()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_actor_id uuid:=auth.uid(); v_actor_role text:=case when public.current_user_is_admin() then 'admin' else 'user' end;
begin
  if tg_op='INSERT' then
    insert into public.photo_audit_log(job_id,photo_id,actor_user_id,actor_role,action,source,storage_path,image_url,details)
    values(new.job_id,new.id,v_actor_id,v_actor_role,'photo_inserted','trigger.photos',new.storage_path,new.image_url,jsonb_build_object('uploaded_by',new.uploaded_by,'created_at',new.created_at)); return new;
  elsif tg_op='UPDATE' then
    insert into public.photo_audit_log(job_id,photo_id,actor_user_id,actor_role,action,source,storage_path,image_url,details)
    values(new.job_id,new.id,v_actor_id,v_actor_role,'photo_updated','trigger.photos',new.storage_path,new.image_url,jsonb_build_object('old_job_id',old.job_id,'old_storage_path',old.storage_path,'old_image_url',old.image_url,'new_job_id',new.job_id,'new_storage_path',new.storage_path,'new_image_url',new.image_url)); return new;
  elsif tg_op='DELETE' then
    insert into public.photo_audit_log(job_id,photo_id,actor_user_id,actor_role,action,source,storage_path,image_url,details)
    values(old.job_id,old.id,v_actor_id,v_actor_role,'photo_deleted','trigger.photos',old.storage_path,old.image_url,jsonb_build_object('uploaded_by',old.uploaded_by,'created_at',old.created_at)); return old;
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $function$
DECLARE cmd record;
BEGIN
 FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE command_tag IN ('CREATE TABLE','CREATE TABLE AS','SELECT INTO') AND object_type IN ('table','partitioned table') LOOP
   IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
     BEGIN EXECUTE format('alter table if exists %s enable row level security',cmd.object_identity); RAISE LOG 'rls_auto_enable: enabled RLS on %',cmd.object_identity;
     EXCEPTION WHEN OTHERS THEN RAISE LOG 'rls_auto_enable: failed to enable RLS on %',cmd.object_identity; END;
   ELSE RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)',cmd.object_identity,cmd.schema_name;
   END IF;
 END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_contractors_updated_at() RETURNS trigger LANGUAGE plpgsql AS $function$ begin new.updated_at:=now(); return new; end; $function$;
CREATE OR REPLACE FUNCTION public.touch_contractors_updated_at() RETURNS trigger LANGUAGE plpgsql AS $function$ begin new.updated_at:=timezone('utc',now()); return new; end; $function$;
CREATE OR REPLACE FUNCTION public.touch_devices_updated_at() RETURNS trigger LANGUAGE plpgsql AS $function$ begin new.updated_at:=timezone('utc',now()); return new; end; $function$;
CREATE OR REPLACE FUNCTION public.touch_push_subscriptions_updated_at() RETURNS trigger LANGUAGE plpgsql AS $function$ begin new.updated_at=now(); return new; end; $function$;
CREATE OR REPLACE FUNCTION public.touch_services_updated_at() RETURNS trigger LANGUAGE plpgsql AS $function$ begin new.updated_at=now(); return new; end; $function$;

CREATE OR REPLACE FUNCTION public.set_job_completion_metadata()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
begin
 if tg_op='INSERT' then if new.status='Zakończone' then new.completed_at:=now(); new.completed_by:=auth.uid(); end if;
 elsif tg_op='UPDATE' then
   if new.status='Zakończone' and old.status is distinct from 'Zakończone' then new.completed_at:=now(); new.completed_by:=auth.uid();
   elsif old.status='Zakończone' and new.status is distinct from 'Zakończone' then new.completed_at:=null; new.completed_by:=null; end if;
 end if; return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.set_job_service_due_date() RETURNS trigger LANGUAGE plpgsql AS $function$
begin new.service_due_date:=public.calculate_service_due_date(new.installation_date); if coalesce(new.sms_recipient_phone,'')='' then new.sms_recipient_phone:=new.phone; end if; return new; end;
$function$;
CREATE OR REPLACE FUNCTION public.storage_object_job_id(p_name text)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
 select case when split_part(coalesce(p_name,''),'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(coalesce(p_name,''),'/',1)::uuid else null end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_device_from_job_row(p_job_id text,p_contractor_id uuid,p_model text,p_serial_number text,p_installation_date date)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_processed_sources text[]:=array[]::text[]; v_service_reminder_years integer:=5;
begin
 select greatest(1,least(coalesce(j.service_reminder_years,5),10)) into v_service_reminder_years from public.jobs j where j.id=p_job_id::uuid;
 v_service_reminder_years:=coalesce(v_service_reminder_years,5);
 with source_fields as (select regexp_split_to_array(replace(replace(coalesce(p_model,''),E'\r\n',E'\n'),E'\r',E'\n'),E'\n') models, regexp_split_to_array(replace(replace(coalesce(p_serial_number,''),E'\r\n',E'\n'),E'\r',E'\n'),E'\n') serials),
 numbered as (select gs.index,trim(coalesce(source_fields.models[gs.index],'')) model,trim(coalesce(source_fields.serials[gs.index],'')) serial_number from source_fields cross join lateral generate_series(1,greatest(coalesce(array_length(source_fields.models,1),0),coalesce(array_length(source_fields.serials,1),0))) gs(index)),
 device_rows as (select case when numbered.index=1 then p_job_id else p_job_id||'::device-'||numbered.index::text end source_job_id,numbered.model,numbered.serial_number from numbered where coalesce(numbered.model,'')<>'' or coalesce(numbered.serial_number,'')<>''),
 upserted as (insert into public.devices(contractor_id,source_job_id,source_kind,model,serial_number,installation_date,service_reminder_years,status,notes)
 select p_contractor_id,source_job_id,'job',model,serial_number,p_installation_date,v_service_reminder_years,'aktywne','' from device_rows
 on conflict(source_job_id) do update set contractor_id=excluded.contractor_id,model=excluded.model,serial_number=excluded.serial_number,installation_date=excluded.installation_date,service_reminder_years=excluded.service_reminder_years,source_kind='job',updated_at=timezone('utc',now()) returning source_job_id)
 select coalesce(array_agg(upserted.source_job_id),array[]::text[]) into v_processed_sources from upserted;
 delete from public.devices d where d.source_kind='job' and (d.source_job_id=p_job_id or d.source_job_id like p_job_id||'::device-%') and not(d.source_job_id=any(v_processed_sources));
end;
$function$;
CREATE OR REPLACE FUNCTION public.sync_device_from_job_trigger()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
 if tg_op='DELETE' then delete from public.devices where source_job_id=old.id::text or source_job_id like old.id::text||'::device-%'; return old; end if;
 perform public.sync_device_from_job_row(new.id::text,new.contractor_id,new.device_model,new.device_serial_number,new.installation_date); return new;
end;
$function$;
