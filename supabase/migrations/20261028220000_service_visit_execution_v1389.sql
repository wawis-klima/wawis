-- WAWIS 13.89: wykonanie przeglądu z dowodami, podpisem i atomową finalizacją.
-- Wyłącznie na gałęzi release; nie uruchamiać na produkcji przed pełnym GO.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('service-visit-files','service-visit-files',false,10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[])
on conflict (id) do nothing;

create policy service_visit_files_admin_read on storage.objects for select to authenticated
 using (bucket_id='service-visit-files' and (select public.current_user_is_admin())
        and exists(select 1 from public.service_visits v
                   where v.id::text=(storage.foldername(name))[1]));
create policy service_visit_files_admin_upload on storage.objects for insert to authenticated
 with check (bucket_id='service-visit-files' and (select public.current_user_is_admin())
             and exists(select 1 from public.service_visits v
                        where v.id::text=(storage.foldername(name))[1] and v.status <> 'odwolany'));

create table public.service_visit_photos (
 id uuid primary key default gen_random_uuid(),
 service_visit_device_id uuid not null references public.service_visit_devices(id) on delete restrict,
 storage_path text not null unique,
 file_size_bytes bigint not null check(file_size_bytes>0 and file_size_bytes<=10485760),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 created_at timestamptz not null default now(),
 created_by uuid not null default auth.uid()
);
create index service_visit_photos_item_idx on public.service_visit_photos(service_visit_device_id);
alter table public.service_visit_photos enable row level security;
create policy service_visit_photos_admin_select on public.service_visit_photos
 for select to authenticated using ((select public.current_user_is_admin()));
create policy service_visit_photos_admin_insert on public.service_visit_photos
 for insert to authenticated with check (
 (select public.current_user_is_admin())
 and exists(
   select 1 from public.service_visit_devices d join public.service_visits v on v.id=d.service_visit_id
   where d.id=service_visit_device_id and v.status not in ('wykonany','odwolany')
     and left(storage_path,length(v.id::text)+1)=(v.id::text||'/')
 )
);
revoke all on public.service_visit_photos from anon;
grant select, insert on public.service_visit_photos to authenticated;

-- Rzeczywisty wykonawca czynności, niezależny od planowanego przydziału.
alter table public.service_visit_devices add column performed_by uuid references public.profiles(id) on delete set null;

-- Wszelkie zmiany wyników i finalizacji przez walidowane funkcje serwera.
revoke update, delete on public.service_visit_devices from authenticated;
revoke insert, update, delete on public.service_visit_protocols from authenticated;
revoke update, delete on public.service_visits from authenticated;
grant update(scheduled_date,scheduled_time,notes,primary_technician_id,additional_technician_ids)
  on public.service_visits to authenticated;

-- RLS admin plus centralna walidacja typów wypełnienia.
create or replace function public.service_visit_admin_save_item(
 p_visit_id uuid, p_item_id uuid, p_checklist jsonb, p_result text, p_notes text default ''
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
 if not public.current_user_is_admin() then raise exception 'Brak uprawnień'; end if;
 select status into v_status from public.service_visits where id=p_visit_id for update;
 if v_status is null then raise exception 'Nie znaleziono wizyty'; end if;
 if v_status in ('wykonany','odwolany') then raise exception 'Nie można edytować zakończonej/odwołanej wizyty'; end if;
 if p_result is not null and p_result not in ('sprawne','usterka') then
   raise exception 'Nieprawidłowy wynik przeglądu';
 end if;
 if jsonb_typeof(p_checklist) <> 'object' or
   exists(select 1 from jsonb_each(p_checklist) k where jsonb_typeof(k.value)<>'boolean') or
   exists(select 1 from jsonb_object_keys(p_checklist) k
      where k not in ('filtry','jednostka_wewnetrzna','skropliny','jednostka_zewnetrzna','dzialanie','instalacja'))
 then raise exception 'Nieprawidłowa lista czynności'; end if;
 if length(coalesce(p_notes,''))>4000 then raise exception 'Uwagi są zbyt długie'; end if;
 update public.service_visit_devices
 set checklist=p_checklist,result=p_result,notes=coalesce(p_notes,''),
     performed_at=case when p_result is not null then coalesce(performed_at,now()) else null end,
     performed_by=case when p_result is not null then auth.uid() else null end
 where id=p_item_id and service_visit_id=p_visit_id;
 if not found then raise exception 'Urządzenie nie należy do tej wizyty'; end if;
 if p_result is not null then
   update public.service_visits set status='w_trakcie' where id=p_visit_id and status='zaplanowany';
 end if;
 return true;
end
$$;
revoke all on function public.service_visit_admin_save_item(uuid,uuid,jsonb,text,text) from public,anon;
grant execute on function public.service_visit_admin_save_item(uuid,uuid,jsonb,text,text) to authenticated;

create or replace function public.service_visit_admin_cancel(p_visit_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if not public.current_user_is_admin() then raise exception 'Brak uprawnień'; end if;
 update public.service_visits set status='odwolany',updated_at=now()
  where id=p_visit_id and status in ('zaplanowany','w_trakcie','oczekuje_na_podpis');
 if not found then raise exception 'Nie można odwołać tej wizyty'; end if;
 return true;
end
$$;
revoke all on function public.service_visit_admin_cancel(uuid) from public,anon;
grant execute on function public.service_visit_admin_cancel(uuid) to authenticated;

-- Czynności wykonane, ale brak podpisu klienta: zachowujemy prawdziwe wyniki i daty.
create or replace function public.service_visit_admin_wait_for_signature(p_visit_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $
declare v_status text; v_done integer;
begin
 if not public.current_user_is_admin() then raise exception 'Brak uprawnień'; end if;
 select status into v_status from public.service_visits where id=p_visit_id for update;
 if v_status is null then raise exception 'Nie znaleziono wizyty'; end if;
 if v_status not in ('zaplanowany','w_trakcie','oczekuje_na_podpis') then
   raise exception 'Wizyta już zakończona lub odwołana'; end if;
 select count(*) into v_done from public.service_visit_devices
   where service_visit_id=p_visit_id and result is not null;
 if v_done=0 then raise exception 'Najpierw zapisz wyniki wykonanych urządzeń'; end if;
 update public.service_visits set status='oczekuje_na_podpis',updated_at=now() where id=p_visit_id;
 return true;
end
$;
revoke all on function public.service_visit_admin_wait_for_signature(uuid) from public,anon;
grant execute on function public.service_visit_admin_wait_for_signature(uuid) to authenticated;

-- Finalizacja pod blokadą FOR UPDATE, po potwierdzeniu plików w prywatnym Storage.
-- Powtórne wywołanie z tym samym plikiem po utracie odpowiedzi jest idempotentne.
create or replace function public.service_visit_admin_complete(
 p_visit_id uuid, p_pdf_path text,p_signature_path text,p_file_name text,
 p_pdf_size bigint,p_snapshot jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_status text; v_protocol uuid; v_devices integer; v_done integer;
declare v_mismatch integer; v_errors integer; v_tstamp timestamptz;
begin
 if not public.current_user_is_admin() then raise exception 'Brak uprawnień'; end if;
 select status into v_status from public.service_visits where id=p_visit_id for update;
 if v_status is null then raise exception 'Nie znaleziono wizyty'; end if;
 if v_status='wykonany' then
   select id into v_protocol from public.service_visit_protocols
    where service_visit_id=p_visit_id and storage_path=p_pdf_path and signature_path=p_signature_path;
   if v_protocol is not null then return v_protocol; end if;
   raise exception 'Wizyta już zakończona innym protokołem';
 end if;
 if v_status='odwolany' then raise exception 'Wizyta została odwołana'; end if;
 if p_pdf_path is null or left(p_pdf_path,length(p_visit_id::text)+5)<>(p_visit_id::text||'/pdf/')
   or p_signature_path is null or left(p_signature_path,length(p_visit_id::text)+12)<>(p_visit_id::text||'/signatures/')
   or p_pdf_size<=0 or p_pdf_size>10485760 then
   raise exception 'Nieprawidłowe ścieżki lub rozmiar dokumentu';
 end if;
 if p_snapshot is null or jsonb_typeof(p_snapshot->'items')<>'array' then
   raise exception 'Brak migawki podpisanego protokołu';
 end if;
 select count(*),count(*) filter(where result is not null),
        min(performed_at) filter(where result is not null)
 into v_devices,v_done,v_tstamp
 from public.service_visit_devices where service_visit_id=p_visit_id;
 if v_devices=0 or v_done=0 then raise exception 'Nie wykonano żadnego przeglądu urządzenia'; end if;
 if jsonb_array_length(p_snapshot->'items')<>v_devices then
   raise exception 'PDF nie obejmuje wszystkich urządzeń z wizyty';
 end if;
 select count(*) into v_mismatch
 from public.service_visit_devices d
 left join lateral(
  select x from jsonb_array_elements(p_snapshot->'items') x
  where x->>'id'=d.id::text
 ) snap on true
 where d.service_visit_id=p_visit_id
   and (snap.x is null
     or (snap.x->>'result') is distinct from d.result
     or snap.x->'checklist' is distinct from d.checklist
     or (snap.x->>'notes') is distinct from d.notes
     or (snap.x->>'performed_by') is distinct from d.performed_by::text);
 if v_mismatch>0 then raise exception 'PDF nie jest zgodny z zapisanymi wynikami. Odśwież i wygeneruj ponownie.'; end if;
 -- Usterka wymaga zdjęcia w tabeli I rzeczywiście istniejącego pliku o rozmiarze >0 B.
 select count(*) into v_errors from public.service_visit_devices d
 where d.service_visit_id=p_visit_id and d.result='usterka'
   and not exists (
     select 1 from public.service_visit_photos p
     join storage.objects o on o.bucket_id='service-visit-files' and o.name=p.storage_path
     where p.service_visit_device_id=d.id and p.file_size_bytes>0
       and coalesce((o.metadata->>'size')::numeric,0)>0
   );
 if v_errors>0 then raise exception 'Do każdej wykrytej usterki wymagane jest zapisane zdjęcie'; end if;
 if not exists(select 1 from storage.objects o
       where o.bucket_id='service-visit-files' and o.name=p_pdf_path
         and coalesce((o.metadata->>'size')::numeric,0)>0)
   or not exists(select 1 from storage.objects o
       where o.bucket_id='service-visit-files' and o.name=p_signature_path
         and coalesce((o.metadata->>'size')::numeric,0)>0)
 then raise exception 'PDF lub podpis nie został potwierdzony w Storage'; end if;
 insert into public.service_visit_protocols
  (service_visit_id,storage_path,signature_path,file_name,file_size_bytes,signed_at,created_by,signed_snapshot)
 values(p_visit_id,p_pdf_path,p_signature_path,left(coalesce(p_file_name,'protokol-serwisowy.pdf'),240),
         p_pdf_size,now(),auth.uid(),p_snapshot)
 returning id into v_protocol;
 update public.service_visits
 set status='wykonany',performed_at=v_tstamp,completed_at=now(),updated_at=now()
 where id=p_visit_id;
 return v_protocol;
end
$$;
revoke all on function public.service_visit_admin_complete(uuid,text,text,text,bigint,jsonb) from public,anon;
grant execute on function public.service_visit_admin_complete(uuid,text,text,text,bigint,jsonb) to authenticated;

comment on table public.service_visit_photos is
 'Dowody fotograficzne przeglądu, tylko administrator na etapie 1; minimum jeden realny plik >0 B na usterkę.';
