-- WAWIS 10.89 / N7 stage B / rebuild-only admin core baseline.

CREATE OR REPLACE FUNCTION public.admin_delete_comment(p_comment_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_is_admin boolean; v_deleted integer;
begin
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Administrator') into v_is_admin;
 if not v_is_admin then raise exception 'Brak uprawnień administratora do usunięcia komentarza.'; end if;
 delete from public.comments where id=p_comment_id; get diagnostics v_deleted=row_count; return v_deleted>0;
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_contractor(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin if not public.current_user_is_admin() then raise exception 'Tylko administrator może usuwać kontrahentów.'; end if; delete from public.contractors where id=p_id; end;$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_device(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin if not public.current_user_is_admin() then raise exception 'Tylko administrator może usuwać urządzenia.'; end if; delete from public.devices where id=p_id; end;$function$;

CREATE OR REPLACE FUNCTION public.admin_get_contractor_devices(p_contractor_id uuid)
RETURNS TABLE(id uuid,contractor_id uuid,model text,serial_number text,installation_date date,service_reminder_years integer,status text,notes text,source_job_id text,source_kind text,created_at timestamptz,updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
 select d.id,d.contractor_id,d.model,d.serial_number,d.installation_date,greatest(1,least(coalesce(d.service_reminder_years,5),10)),d.status,d.notes,d.source_job_id,d.source_kind,d.created_at,d.updated_at
 from public.devices d where public.current_user_is_admin() and d.contractor_id=p_contractor_id order by d.installation_date desc nulls last,d.created_at desc,d.id desc;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_contractors()
RETURNS SETOF contractors LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin if not public.current_user_is_admin() then raise exception 'Brak uprawnień administratora'; end if; return query select * from public.contractors order by lower(company_name),created_at desc; end;$function$;

CREATE OR REPLACE FUNCTION public.admin_list_devices_with_contractor()
RETURNS TABLE(id uuid,contractor_id uuid,contractor_name text,contractor_city text,contractor_street text,contractor_phone text,contractor_email text,model text,serial_number text,installation_date date,service_reminder_years integer,status text,notes text,source_job_id text,source_kind text,created_at timestamptz,updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
 select d.id,d.contractor_id,coalesce(c.company_name,''),coalesce(c.city,''),coalesce(c.street,''),coalesce(c.phone,''),coalesce(c.email,''),d.model,d.serial_number,d.installation_date,greatest(1,least(coalesce(d.service_reminder_years,5),10)),d.status,d.notes,d.source_job_id,d.source_kind,d.created_at,d.updated_at
 from public.devices d left join public.contractors c on c.id=d.contractor_id where public.current_user_is_admin() order by d.installation_date desc nulls last,d.created_at desc,d.id desc;
$function$;

CREATE OR REPLACE FUNCTION public.admin_sync_devices_from_jobs()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_job record; v_processed integer:=0; v_deleted integer:=0;
begin
 if not public.current_user_is_admin() then raise exception 'Tylko administrator może synchronizować urządzenia.'; end if;
 for v_job in select id,contractor_id,device_model,device_serial_number,installation_date from public.jobs loop
  perform public.sync_device_from_job_row(v_job.id::text,v_job.contractor_id,v_job.device_model,v_job.device_serial_number,v_job.installation_date); v_processed:=v_processed+1;
 end loop;
 delete from public.devices d where d.source_kind='job' and d.source_job_id is not null and not exists(select 1 from public.jobs j where d.source_job_id=j.id::text or d.source_job_id like j.id::text||'::device-%');
 get diagnostics v_deleted=row_count; return jsonb_build_object('processed_jobs',v_processed,'deleted_orphans',v_deleted);
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_update_device_status(p_id uuid,p_status text)
RETURNS devices LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_row public.devices; v_status text;
begin
 if not public.current_user_is_admin() then raise exception 'Tylko administrator może zmieniać status urządzenia.'; end if;
 v_status:=coalesce(nullif(trim(p_status),''),'aktywne'); if v_status not in ('aktywne','do_serwisu','zdemontowane') then raise exception 'Nieprawidłowy status urządzenia.'; end if;
 update public.devices set status=v_status,updated_at=timezone('utc',now()) where id=p_id returning * into v_row; if v_row is null then raise exception 'Nie znaleziono urządzenia.'; end if; return v_row;
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_contractor(p_id uuid DEFAULT NULL::uuid,p_company_name text DEFAULT NULL::text,p_contact_person text DEFAULT NULL::text,p_phone text DEFAULT NULL::text,p_email text DEFAULT NULL::text,p_city text DEFAULT NULL::text,p_street text DEFAULT NULL::text,p_notes text DEFAULT NULL::text,p_nip text DEFAULT NULL::text,p_is_active boolean DEFAULT true,p_addresses jsonb DEFAULT NULL::jsonb)
RETURNS contractors LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_row public.contractors; v_addresses jsonb; v_primary_city text; v_primary_street text;
begin
 if not public.current_user_is_admin() then raise exception 'Tylko administrator może zapisywać kontrahentów.'; end if;
 if coalesce(trim(p_company_name),'')='' then raise exception 'Nazwa kontrahenta jest wymagana.'; end if;
 v_addresses:=public.normalize_contractor_addresses(p_addresses,p_city,p_street);
 select nullif(trim(item->>'city'),''),nullif(trim(item->>'street'),'') into v_primary_city,v_primary_street from jsonb_array_elements(v_addresses) item order by case when lower(coalesce(item->>'is_primary','false')) in ('true','1','yes') then 0 else 1 end limit 1;
 if p_id is null then
  insert into public.contractors(company_name,contact_person,phone,email,city,street,addresses,notes,nip,is_active) values(trim(p_company_name),nullif(trim(coalesce(p_contact_person,'')),''),nullif(trim(coalesce(p_phone,'')),''),nullif(trim(coalesce(p_email,'')),''),v_primary_city,v_primary_street,v_addresses,nullif(trim(coalesce(p_notes,'')),''),nullif(trim(coalesce(p_nip,'')),''),coalesce(p_is_active,true)) returning * into v_row;
 else
  update public.contractors set company_name=trim(p_company_name),contact_person=nullif(trim(coalesce(p_contact_person,'')),''),phone=nullif(trim(coalesce(p_phone,'')),''),email=nullif(trim(coalesce(p_email,'')),''),city=v_primary_city,street=v_primary_street,addresses=v_addresses,notes=nullif(trim(coalesce(p_notes,'')),''),nip=nullif(trim(coalesce(p_nip,'')),''),is_active=coalesce(p_is_active,true) where id=p_id returning * into v_row;
  if v_row is null then raise exception 'Nie znaleziono kontrahenta do edycji.'; end if;
 end if; return v_row;
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_device(p_id uuid DEFAULT NULL::uuid,p_contractor_id uuid DEFAULT NULL::uuid,p_model text DEFAULT ''::text,p_serial_number text DEFAULT ''::text,p_installation_date date DEFAULT NULL::date,p_service_reminder_years integer DEFAULT 5,p_status text DEFAULT 'aktywne'::text,p_notes text DEFAULT ''::text,p_source_job_id text DEFAULT NULL::text,p_source_kind text DEFAULT 'manual'::text)
RETURNS devices LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_row public.devices; v_status text; v_years integer; v_base_source_job_id text;
begin
 if not public.current_user_is_admin() then raise exception 'Tylko administrator może zapisywać urządzenia.'; end if;
 v_status:=coalesce(nullif(trim(p_status),''),'aktywne'); if v_status not in ('aktywne','do_serwisu','zdemontowane') then raise exception 'Nieprawidłowy status urządzenia.'; end if; v_years:=greatest(1,least(coalesce(p_service_reminder_years,5),10));
 if p_id is null then insert into public.devices(contractor_id,model,serial_number,installation_date,service_reminder_years,status,notes,source_job_id,source_kind) values(p_contractor_id,trim(coalesce(p_model,'')),trim(coalesce(p_serial_number,'')),p_installation_date,v_years,v_status,coalesce(p_notes,''),nullif(trim(coalesce(p_source_job_id,'')),''),coalesce(nullif(trim(coalesce(p_source_kind,'')),''),'manual')) returning * into v_row;
 else update public.devices set contractor_id=p_contractor_id,model=trim(coalesce(p_model,'')),serial_number=trim(coalesce(p_serial_number,'')),installation_date=p_installation_date,service_reminder_years=v_years,status=v_status,notes=coalesce(p_notes,''),source_job_id=nullif(trim(coalesce(p_source_job_id,'')),''),source_kind=coalesce(nullif(trim(coalesce(p_source_kind,'')),''),source_kind),updated_at=timezone('utc',now()) where id=p_id returning * into v_row; if v_row is null then raise exception 'Nie znaleziono urządzenia do edycji.'; end if; end if;
 v_base_source_job_id:=regexp_replace(coalesce(v_row.source_job_id,''),'::device-[0-9]+$',''); if v_base_source_job_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then update public.jobs set service_reminder_years=v_years where id=v_base_source_job_id::uuid; end if; return v_row;
end;$function$;
