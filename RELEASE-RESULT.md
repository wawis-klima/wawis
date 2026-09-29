# RELEASE RESULT

## Wersja
- 11.78

## Zakres
- audyt Kontrahentów: etap 5 / K16 + K19 + K21

## K16 — pełne urządzenia na mobile
- urządzenia zapisanych kontrahentów są pobierane z `admin_get_contractor_devices` dopiero po rozwinięciu konkretnego klienta
- mobile widzi również rekordy `manual_import`, a nie tylko urządzenia wynikające z `jobs`
- wynik jest związany z aktualnym `contractorId`
- przy braku pełnej bazy/błędzie fallback z montaży jest jawnie oznaczony jako niepełny

## K19 — świeżość katalogu
- mobile ma przycisk `Odśwież`
- desktop i mobile zachowują poprzednią poprawną listę podczas odświeżania
- po błędzie lista nie jest zerowana; UI pokazuje `Dane mogą być nieaktualne`
- widoczny jest czas ostatniego udanego odczytu
- panel przekazuje świeży snapshot do App; formularz montażu korzysta z tej samej zaktualizowanej zawartości
- panel może wystartować od katalogu już załadowanego w App zamiast od pustej tablicy

## K21 — kompletność katalogu
- nowy `admin_get_contractors_catalog()` zwraca cały katalog w jednej wartości JSONB
- snapshot ma jeden kanoniczny porządek: `lower(company_name), created_at DESC, id`
- usunięto warunek `firstBatch.length === 1000` i offsetowe `.range(...)`
- limit wierszy PostgREST nie może już uciąć katalogu na granicy 1000, bo odpowiedź RPC ma jeden top-level JSON wynik
- eksport/liczniki/duplikaty korzystają z tego samego pełnego loadera
- bez zmian RLS; RPC pozostaje admin-only

## Kontrola regresji
- `scripts/smoke-contractors-stage5-v1178.mjs`
- fixture 1345 kontrahentów: jeden RPC, brak offsetowego SELECT-u, pełna liczba rekordów
- K16: manual_import + urządzenie z montażu dla tego samego klienta
- statyczna kontrola świeżości, przycisku Odśwież oraz synchronizacji App↔panel
- WAWIS PR checks: PENDING
- Playwright desktop/mobile: PENDING
- produkcyjny build: PENDING
- migracja Supabase: PENDING
- Vercel: PENDING
- merge: PENDING
