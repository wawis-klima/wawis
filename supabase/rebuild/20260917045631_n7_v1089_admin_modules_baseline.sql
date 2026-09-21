-- WAWIS 10.89 / N7 stage B / rebuild-only admin modules baseline.

CREATE OR REPLACE FUNCTION public.admin_get_device_sms_history(p_device_id uuid,p_source_job_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid,job_id uuid,device_id uuid,client text,phone text,status text,error_message text,created_at timestamptz,planned_for timestamptz,approved_at timestamptz,sent_at timestamptz,delivered_at timestamptz,reminder_cycle integer,reminder_due_date date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
 if coalesce(auth.role(),'')<>'service_role' and not public.current_user_is_admin() then raise exception 'Tylko administrator może odczytywać historię SMS urządzenia.' using errcode='42501'; end if;
 return query select l.id,l.job_id,l.device_id,l.client,l.phone,l.status,l.error_message,l.created_at,l.planned_for,l.approved_at,l.sent_at,l.delivered_at,l.reminder_cycle,l.reminder_due_date from public.sms_log l where l.device_id=p_device_id or (p_source_job_id is not null and l.job_id=p_source_job_id) order by l.created_at desc limit 200;
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_get_job_photo_audit(p_job_id uuid)
RETURNS TABLE(id uuid,job_id uuid,photo_id uuid,actor_user_id uuid,actor_role text,action text,source text,storage_path text,image_url text,details jsonb,created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
 select l.id,l.job_id,l.photo_id,l.actor_user_id,l.actor_role,l.action,l.source,l.storage_path,l.image_url,l.details,l.created_at from public.photo_audit_log l where public.current_user_is_admin() and l.job_id=p_job_id order by l.created_at desc,l.id desc;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_sms_module_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_settings jsonb; v_logs jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' and not public.current_user_is_admin() then raise exception 'Tylko administrator może odczytywać dane modułu SMS.' using errcode='42501'; end if;
 select to_jsonb(s) into v_settings from (select id,is_enabled,sending_mode,sender_name,service_phone,company_name,template_service_reminder,updated_at from public.sms_settings order by updated_at desc nulls last,created_at desc nulls last limit 1)s;
 select coalesce(jsonb_agg(row_to_json(l) order by l.created_at desc),'[]'::jsonb) into v_logs from (select id,job_id,device_id,client,phone,sms_type,provider,provider_message_id,status,planned_for,approved_at,sent_at,delivered_at,error_message,reminder_cycle,reminder_due_date,created_at from public.sms_log order by created_at desc limit 300)l;
 return jsonb_build_object('settings',coalesce(v_settings,'{}'::jsonb),'logs',coalesce(v_logs,'[]'::jsonb));
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_nameplate_product(p_ean text,p_manufacturer text,p_family text DEFAULT NULL::text,p_model_code text DEFAULT NULL::text,p_model_name text DEFAULT NULL::text,p_capacity_kw numeric DEFAULT NULL::numeric,p_unit_type text DEFAULT 'unknown'::text,p_revision text DEFAULT NULL::text,p_source_type text DEFAULT 'manual'::text,p_source_reference text DEFAULT NULL::text,p_verified boolean DEFAULT true)
RETURNS nameplate_product_catalog LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_ean text:=regexp_replace(coalesce(p_ean,''),'[^0-9]','','g'); v_unit_type text:=lower(trim(coalesce(p_unit_type,'unknown'))); v_source_type text:=lower(trim(coalesce(p_source_type,'manual'))); v_row public.nameplate_product_catalog;
begin
 if not public.current_user_is_admin() then raise exception 'Tylko administrator może zapisywać katalog EAN.'; end if;
 if v_ean !~ '^[0-9]{13}$' then raise exception 'EAN/GTIN musi zawierać dokładnie 13 cyfr.'; end if;
 if coalesce(trim(p_manufacturer),'')='' then raise exception 'Marka jest wymagana.'; end if;
 if coalesce(trim(p_model_name),'')='' then raise exception 'Nazwa modelu jest wymagana.'; end if;
 if v_unit_type not in ('indoor','outdoor','unknown') then raise exception 'Nieprawidłowy typ jednostki: %',p_unit_type; end if;
 if v_source_type not in ('manual','confirmed_scan','import','manufacturer','gs1','local_dictionary') then v_source_type:='manual'; end if;
 insert into public.nameplate_product_catalog(ean,manufacturer,family,model_code,model_name,capacity_kw,unit_type,revision,source_type,source_reference,verified,created_by,updated_at)
 values(v_ean,trim(p_manufacturer),nullif(trim(coalesce(p_family,'')),''),nullif(upper(trim(coalesce(p_model_code,''))),''),trim(p_model_name),p_capacity_kw,v_unit_type,nullif(upper(trim(coalesce(p_revision,''))),''),v_source_type,nullif(trim(coalesce(p_source_reference,'')),''),coalesce(p_verified,true),auth.uid(),now())
 on conflict(ean) do update set manufacturer=excluded.manufacturer,family=coalesce(excluded.family,public.nameplate_product_catalog.family),model_code=coalesce(excluded.model_code,public.nameplate_product_catalog.model_code),model_name=excluded.model_name,capacity_kw=coalesce(excluded.capacity_kw,public.nameplate_product_catalog.capacity_kw),unit_type=case when excluded.unit_type='unknown' then public.nameplate_product_catalog.unit_type else excluded.unit_type end,revision=coalesce(excluded.revision,public.nameplate_product_catalog.revision),source_type=excluded.source_type,source_reference=coalesce(excluded.source_reference,public.nameplate_product_catalog.source_reference),verified=public.nameplate_product_catalog.verified or excluded.verified,updated_at=now() returning * into v_row;
 return v_row;
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_import_nameplate_products(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_item jsonb; v_imported integer:=0; v_invalid integer:=0; v_errors jsonb:='[]'::jsonb; v_ean text; v_capacity numeric;
begin
 if not public.current_user_is_admin() then raise exception 'Tylko administrator może importować katalog EAN.'; end if;
 if jsonb_typeof(p_rows)<>'array' then raise exception 'Import katalogu wymaga tablicy JSON.'; end if;
 for v_item in select value from jsonb_array_elements(p_rows) loop
  begin
   v_ean:=regexp_replace(coalesce(v_item->>'ean',''),'[^0-9]','','g'); v_capacity:=nullif(replace(regexp_replace(coalesce(v_item->>'capacity_kw',''),'[^0-9,.]','','g'),',','.'),'')::numeric;
   perform public.admin_upsert_nameplate_product(v_ean,v_item->>'manufacturer',v_item->>'family',v_item->>'model_code',v_item->>'model_name',v_capacity,coalesce(v_item->>'unit_type','unknown'),v_item->>'revision',coalesce(v_item->>'source_type','import'),v_item->>'source_reference',coalesce((v_item->>'verified')::boolean,true)); v_imported:=v_imported+1;
  exception when others then v_invalid:=v_invalid+1; v_errors:=v_errors||jsonb_build_array(jsonb_build_object('ean',coalesce(v_ean,v_item->>'ean',''),'error',sqlerrm)); end;
 end loop;
 return jsonb_build_object('imported',v_imported,'invalid',v_invalid,'errors',v_errors);
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_sms_settings(p_is_enabled boolean,p_sender_name text,p_service_phone text,p_company_name text,p_template_service_reminder text)
RETURNS sms_settings LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_row public.sms_settings;
begin
 if coalesce(auth.role(),'')<>'service_role' and not public.current_user_is_admin() then raise exception 'Tylko administrator może zapisywać ustawienia modułu SMS.' using errcode='42501'; end if;
 update public.sms_settings set is_enabled=coalesce(p_is_enabled,true),sending_mode='approval',sender_name=nullif(trim(coalesce(p_sender_name,'')),''),service_phone=nullif(trim(coalesce(p_service_phone,'')),''),company_name=nullif(trim(coalesce(p_company_name,'')),''),template_service_reminder=coalesce(nullif(trim(coalesce(p_template_service_reminder,'')),''),'Dzień dobry {client}, przypominamy o obowiązkowym przeglądzie klimatyzacji po 11 miesiącach od montażu. Aby utrzymać gwarancję, prosimy o kontakt: {service_phone}. {company_name}'),updated_at=now() where id=(select id from public.sms_settings order by updated_at desc nulls last,created_at desc nulls last limit 1) returning * into v_row;
 if v_row.id is null then insert into public.sms_settings(is_enabled,sending_mode,sender_name,service_phone,company_name,template_service_reminder,updated_at) values(coalesce(p_is_enabled,true),'approval',nullif(trim(coalesce(p_sender_name,'')),''),nullif(trim(coalesce(p_service_phone,'')),''),nullif(trim(coalesce(p_company_name,'')),''),coalesce(nullif(trim(coalesce(p_template_service_reminder,'')),''),'Dzień dobry {client}, przypominamy o obowiązkowym przeglądzie klimatyzacji po 11 miesiącach od montażu. Aby utrzymać gwarancję, prosimy o kontakt: {service_phone}. {company_name}'),now()) returning * into v_row; end if;
 return v_row;
end;$function$;
