-- Wawis Klimatyzacja — production-upgrade-v8.15.sql
-- Wersja 8.15 jest porządkowa: naprawia testy, CSS i organizację release'u.
-- Nie wymaga zmian struktury produkcyjnej bazy danych.
--
-- Zasada release'u zostaje bez zmian:
-- 1) każda nowa tabela public.* musi mieć ALTER TABLE ... ENABLE ROW LEVEL SECURITY,
-- 2) każda nowa tabela public.* musi mieć jawny GRANT dla właściwej roli API,
-- 3) przed release'em uruchamiamy npm run test:smoke:supabase-grants.
--
-- Starsze pliki SQL z poprzednich etapów projektu pozostają w paczce jako archiwum/historyczne hotfixy.
-- Ten plik jest bieżącym punktem wejścia dla wersji 8.15.

do $$
begin
  raise notice 'Wersja 8.15: brak wymaganej migracji bazy danych. Sprawdź archiwalne SQL tylko jeśli odtwarzasz starszą instalację.';
end $$;
