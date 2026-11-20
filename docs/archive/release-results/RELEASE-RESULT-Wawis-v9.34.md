# RELEASE RESULT - Wawis 9.34

## Wersja
- 9.34

## Zakres
- desktopowy modal `Urządzenia` administratora ma wysokość dopasowaną do treści zamiast stałych 760 px,
- jasnoszary obszar roboczy, białe karty oraz oddzielone nagłówek i stopka tworzą czytelną hierarchię,
- karta urządzenia ma kompaktowe 88 px wysokości, a akcja dodania kolejnego urządzenia 48 px,
- główna akcja desktopowa ma etykietę `Zapisz urządzenia`,
- mobilny kreator zachowuje dotychczasowy wygląd i domyślną etykietę.

## Supabase
- brak nowej migracji SQL,
- brak zmian Edge Functions,
- brak zmian zasad Storage i RLS.

## Kontrola
- `smoke-desktop-device-wizard-polish`: PASS,
- `smoke-admin-device-entry`: PASS,
- `smoke-desktop-only`: PASS,
- `smoke-release-runner`: PASS,
- produkcyjny build Vite: PASS,
- dodano test E2E geometrii i kolorów modalu dla środowiska CI z Chromium.
