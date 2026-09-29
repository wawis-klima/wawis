-- WAWIS 11.79 — K12: spójna normalizacja kontrahentów.
-- K14 (blokada równoczesnych INSERT-ów) celowo NIE jest częścią tej migracji.

begin;

create or replace function public.normalize_contractors_phone(input_phone text)
returns text
language sql
immutable
set search_path to ''
as $function$
  with source as (
    select
      trim(coalesce(input_phone, '')) as raw,
      regexp_replace(coalesce(input_phone, ''), '\D+', '', 'g') as digits
  )
  select case
    when digits = '' then null
    -- 0048 500 600 700 -> +48500600700
    when digits ~ '^0048[0-9]{9}$' then '+48' || substring(digits from 5)
    -- 48 500 600 700 -> +48500600700
    when digits ~ '^48[0-9]{9}$' then '+' || digits
    -- 500 600 700 -> +48500600700
    when digits ~ '^[0-9]{9}$' then '+48' || digits
    -- jawny numer międzynarodowy zachowuje prefiks kraju
    when raw like '+%' then '+' || digits
    when digits ~ '^00[0-9]+$' then '+' || substring(digits from 3)
    -- numer bez jednoznacznego kodu kraju: nie zgadujemy i nie obcinamy cyfr
    else digits
  end
  from source;
$function$;

-- Funkcja jest IMMUTABLE i jest używana przez indeks wyrażeniowy.
-- Po zmianie definicji indeks musi zostać przebudowany.
drop index if exists public.contractors_phone_lookup_idx;
create index contractors_phone_lookup_idx
  on public.contractors (public.normalize_contractors_phone(phone));

commit;
