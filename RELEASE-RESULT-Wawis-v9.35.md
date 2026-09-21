# RELEASE RESULT - Wawis 9.35

## Wersja
- 9.35

## Zakres
- desktopowy modal `Urządzenia` administratora ma maksymalnie 540 px szerokości i 18 px promienia,
- wewnętrzny kreator wypełnia 100% szerokości modalu, dzięki czemu nie powstają szerokie boczne pasy,
- karta urządzenia ma kompaktowe 78 px wysokości, a akcja dodania kolejnego urządzenia 40 px,
- główna akcja desktopowa ma etykietę `Zapisz urządzenia` i neutralny grafitowy styl,
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
- zaktualizowano test E2E szerokości, bocznych odstępów, geometrii i kolorów modalu dla środowiska CI z Chromium.

## Build lokalny
- produkcyjny build Vite: PASS,
- brak błędów kompilacji.
