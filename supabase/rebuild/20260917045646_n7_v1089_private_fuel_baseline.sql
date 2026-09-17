-- WAWIS 10.89 / N7 stage B / rebuild-only private fuel baseline.

CREATE OR REPLACE FUNCTION private.audit_fuel_entry_correction_v1026()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $function$
begin
 new.vehicle_id:=old.vehicle_id; new.fueled_at:=old.fueled_at; new.created_by:=old.created_by; new.created_at:=old.created_at; new.odometer_photo_path:=old.odometer_photo_path; new.odometer_ai_confidence:=old.odometer_ai_confidence; new.odometer_read_source:=old.odometer_read_source;
 if new.liters is distinct from old.liters or new.odometer_km is distinct from old.odometer_km then
  if coalesce(old.correction_count,0)=0 then new.original_liters:=old.liters; new.original_odometer_km:=old.odometer_km; else new.original_liters:=old.original_liters; new.original_odometer_km:=old.original_odometer_km; end if;
  new.corrected_by:=auth.uid(); new.corrected_at:=now(); new.correction_count:=coalesce(old.correction_count,0)+1;
 else new.corrected_by:=old.corrected_by; new.corrected_at:=old.corrected_at; new.correction_count:=old.correction_count; new.original_liters:=old.original_liters; new.original_odometer_km:=old.original_odometer_km; end if;
 return new;
end;$function$;

CREATE OR REPLACE FUNCTION private.validate_fuel_entry_capacity_v1025()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare vehicle_capacity numeric(6,2);
begin
 select vehicle.tank_capacity_liters into vehicle_capacity from public.fuel_vehicles as vehicle where vehicle.id=new.vehicle_id;
 if vehicle_capacity is not null and new.liters>vehicle_capacity then raise exception using errcode='23514',message=format('Nie można zatankować %s l. Pojemność baku tego samochodu to %s l.',new.liters,vehicle_capacity); end if;
 return new;
end;$function$;

CREATE OR REPLACE FUNCTION private.validate_fuel_entry_edit_odometer_v1026()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare previous_odometer integer; next_odometer integer;
begin
 if new.odometer_km is not distinct from old.odometer_km then return new; end if;
 select entry.odometer_km into previous_odometer from public.fuel_entries as entry where entry.vehicle_id=old.vehicle_id and entry.id<>old.id and (entry.fueled_at<old.fueled_at or (entry.fueled_at=old.fueled_at and entry.created_at<old.created_at) or (entry.fueled_at=old.fueled_at and entry.created_at=old.created_at and entry.id<old.id)) order by entry.fueled_at desc,entry.created_at desc,entry.id desc limit 1;
 select entry.odometer_km into next_odometer from public.fuel_entries as entry where entry.vehicle_id=old.vehicle_id and entry.id<>old.id and (entry.fueled_at>old.fueled_at or (entry.fueled_at=old.fueled_at and entry.created_at>old.created_at) or (entry.fueled_at=old.fueled_at and entry.created_at=old.created_at and entry.id>old.id)) order by entry.fueled_at asc,entry.created_at asc,entry.id asc limit 1;
 if previous_odometer is not null and new.odometer_km<previous_odometer then raise exception using errcode='23514',message=format('Poprawiony przebieg nie może być niższy niż poprzednie tankowanie: %s km.',previous_odometer); end if;
 if next_odometer is not null and new.odometer_km>next_odometer then raise exception using errcode='23514',message=format('Poprawiony przebieg nie może być wyższy niż następne tankowanie: %s km.',next_odometer); end if;
 return new;
end;$function$;
