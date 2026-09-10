-- Wawis Klimatyzacja — production-upgrade-v8.18.sql
-- Wersja 8.18 jest czyszczeniem plików aplikacji: usunięto stare prototypy, duplikaty assetów,
-- martwe komponenty UI i niewpięty eksport montaży.
-- Nie wymaga zmian struktury produkcyjnej bazy danych.
--
-- Zasada release'u zostaje bez zmian:
-- 1) każda nowa tabela public.* musi mieć ALTER TABLE ... ENABLE ROW LEVEL SECURITY,
-- 2) każda nowa tabela public.* musi mieć jawny GRANT dla właściwej roli API,
-- 3) przed release'em uruchamiamy npm run test:smoke:supabase-grants.

do $$
begin
  raise notice 'Wersja 8.18: brak wymaganej migracji bazy danych. Zmiany obejmują wyłącznie cleanup plików aplikacji.';
end $$;
