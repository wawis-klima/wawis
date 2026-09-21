# RELEASE RESULT — 8.25

Zakres: hotfix wyłącznie dla widoku mobilnego/pracownika w połączonej aplikacji 8.x.

## Naprawa
- Mobilna baza 7.91 nie ładowała zdjęć z montaży po połączeniu z desktopem 8.23, bo używała publicznych URL-i.
- Nowsza aplikacja 8.x przechowuje zdjęcia w prywatnym bucketcie `job-photos` i wymaga signed URL.
- Widok mobilny generuje teraz signed URL dla zdjęć po `storage_path`.
- Upload mobilny zapisuje `storage_path` i pusty `image_url`, tak jak mechanizm prywatnych zdjęć w 8.x.

## Sprawdzenia
- build Vite x2: OK
- smoke mobile private photos: OK
- smoke version UI: OK
- kontrola ZIP bez `node_modules`, `dist`, `logs*`, `supabase/.temp`: OK

## Wersja
- app-version.json: 8.25
- package.json: 8.25
- package-lock.json: 8.25
- src/version.js: 8.25
- src/mobile791/version.js: 8.25
