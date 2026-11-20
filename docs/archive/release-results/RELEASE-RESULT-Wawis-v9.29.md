# RELEASE RESULT - Wawis 9.29

## Wersja
- 9.29

## Zakres
- administrator desktop: dodawanie i edycja urządzeń z poziomu karty montażu,
- administrator desktop: zdjęcia tabliczek JZ/JW w tym samym kreatorze Single/Multi używanym w workflow mobilnym,
- administrator mobile: bezpośredni przycisk `Urządzenia` otwierający istniejący kreator urządzeń/tabliczek,
- istniejące tabliczki są zachowywane i rozpoznawane w kreatorze,
- zapis desktopowych tabliczek używa prywatnego bucketu `job-photos` i katalogu `nameplates`.

## Supabase
- brak nowej migracji SQL,
- brak zmian Edge Functions,
- wykorzystane są istniejące tabele `jobs`, `photos` i prywatny bucket `job-photos`.

## Kontrola
- `smoke-admin-device-entry-v929` 2x PASS,
- `smoke-job-device-save` 2x PASS,
- `smoke-job-multi-indoor-units` 2x PASS,
- `smoke-job-device-type-switch` 2x PASS,
- `smoke-mobile-device-table-v889` 2x PASS,
- `smoke-mobile-new-job-no-devices-v916` 2x PASS,
- `smoke-nameplate-image-rendering` 2x PASS,
- `smoke-nameplate-quality` 2x PASS,
- `smoke-role-access` 2x PASS,
- `smoke-desktop-job-details-polish` 2x PASS,
- `smoke-version-ui` 2x PASS.

## Build lokalny
- próba uruchomienia `npm run build` w środowisku wykonawczym nie wystartowała z powodu niedostępnego lokalnego runtime npm/container; pełny build Vite nie jest oznaczony jako PASS,
- zmienione moduły JS przeszły `node --check`, a regresja źródłowa została wykonana 2x.
