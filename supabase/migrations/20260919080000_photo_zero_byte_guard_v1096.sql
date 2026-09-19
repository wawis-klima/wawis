-- WAWIS 10.96 — ochrona przed rekordami zdjęć wskazującymi na pusty obiekt 0 B.
-- 1) usuwa wyłącznie stare puste rekordy, dla których istnieje poprawny zamiennik tego samego slotu,
-- 2) oznacza pozostałe puste tabliczki do ponownego wgrania,
-- 3) blokuje nowe INSERT/UPDATE photos, jeśli odpowiadający obiekt job-photos istnieje i ma 0 B.

insert into public.photo_audit_log
  (job_id, photo_id, actor_user_id, actor_role, action, source, storage_path, image_url, details)
select p.job_id,
       p.id,
       null,
       'system',
       'photo_zero_byte_needs_reupload',
       'migration.v10.96',
       p.storage_path,
       p.image_url,
       jsonb_build_object(
         'reason','storage_object_zero_bytes',
         'size_bytes',0,
         'recommended_action','reupload_nameplate'
       )
from public.photos p
join storage.objects o
  on o.bucket_id='job-photos' and o.name=p.storage_path
where o.metadata->>'size' ~ '^[0-9]+$'
  and (o.metadata->>'size')::bigint=0
  and not exists (
    select 1
    from public.photos p2
    join storage.objects o2
      on o2.bucket_id='job-photos' and o2.name=p2.storage_path
    where p2.job_id=p.job_id
      and p2.photo_kind=p.photo_kind
      and coalesce(p2.device_index,-1)=coalesce(p.device_index,-1)
      and coalesce(p2.unit_ref,'')=coalesce(p.unit_ref,'')
      and p2.id<>p.id
      and o2.metadata->>'size' ~ '^[0-9]+$'
      and (o2.metadata->>'size')::bigint>0
  )
  and not exists (
    select 1
    from public.photo_audit_log a
    where a.photo_id=p.id
      and a.action='photo_zero_byte_needs_reupload'
  );

delete from public.photos p
where exists (
  select 1
  from storage.objects o
  where o.bucket_id='job-photos'
    and o.name=p.storage_path
    and o.metadata->>'size' ~ '^[0-9]+$'
    and (o.metadata->>'size')::bigint=0
)
and exists (
  select 1
  from public.photos p2
  join storage.objects o2
    on o2.bucket_id='job-photos' and o2.name=p2.storage_path
  where p2.job_id=p.job_id
    and p2.photo_kind=p.photo_kind
    and coalesce(p2.device_index,-1)=coalesce(p.device_index,-1)
    and coalesce(p2.unit_ref,'')=coalesce(p.unit_ref,'')
    and p2.id<>p.id
    and o2.metadata->>'size' ~ '^[0-9]+$'
    and (o2.metadata->>'size')::bigint>0
);

create or replace function public.reject_zero_byte_photo_storage()
returns trigger
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_size bigint;
begin
  if nullif(btrim(coalesce(new.storage_path,'')), '') is null then
    return new;
  end if;

  select case
           when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint
           else null
         end
    into v_size
  from storage.objects o
  where o.bucket_id='job-photos'
    and o.name=new.storage_path
  limit 1;

  if found and coalesce(v_size,0) <= 0 then
    raise exception using
      errcode='P0001',
      message='PHOTO_ZERO_BYTES',
      detail='photos.storage_path points to an empty job-photos object';
  end if;

  return new;
end;
$$;

drop trigger if exists photos_reject_zero_byte_storage on public.photos;
create trigger photos_reject_zero_byte_storage
before insert or update of storage_path on public.photos
for each row
execute function public.reject_zero_byte_photo_storage();
