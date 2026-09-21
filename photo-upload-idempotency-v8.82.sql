-- Wawis 8.82 — idempotentny zapis zdjęć i tabliczek.
-- Uruchom w Supabase SQL Editor przed wdrożeniem aplikacji 8.82.

begin;

-- Jedna ścieżka w Storage może odpowiadać tylko jednemu rekordowi zdjęcia.
-- Starsze, dokładnie zduplikowane rekordy tej samej ścieżki są redukowane
-- do najnowszego wpisu. Sam plik w bucket pozostaje bez zmian.
with ranked as (
  select
    id,
    row_number() over (
      partition by storage_path
      order by created_at desc nulls last, id::text desc
    ) as duplicate_number
  from public.photos
  where storage_path is not null
    and btrim(storage_path) <> ''
)
delete from public.photos as photos
using ranked
where photos.id = ranked.id
  and ranked.duplicate_number > 1;

create unique index if not exists photos_storage_path_unique_v882
  on public.photos (storage_path)
  where storage_path is not null
    and btrim(storage_path) <> '';

commit;
