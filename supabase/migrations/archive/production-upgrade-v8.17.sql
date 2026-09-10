-- Wawis Klimatyzacja — production-upgrade-v8.17.sql
-- Wersja 8.17 jest porządkowa: domyka temat osobnego modułu Serwisy w UI/dokumentacji.
-- Nie wymaga zmian struktury produkcyjnej bazy danych.
--
-- Ważne rozróżnienie:
-- - funkcje SMS przypominające o serwisie urządzeń pozostają częścią obecnego modułu SMS,
-- - osobny moduł Serwisy nie jest wdrażany w tej wersji.
--
-- Zasada release'u zostaje bez zmian:
-- 1) każda nowa tabela public.* musi mieć ALTER TABLE ... ENABLE ROW LEVEL SECURITY,
-- 2) każda nowa tabela public.* musi mieć jawny GRANT dla właściwej roli API,
-- 3) przed release'em uruchamiamy npm run test:smoke:supabase-grants.

do $$
begin
  raise notice 'Wersja 8.17: brak wymaganej migracji bazy danych. Moduł Serwisy pozostaje niewdrożony.';
end $$;
