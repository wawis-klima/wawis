# RELEASE RESULT - Wawis 9.28

## Wersja
- 9.28

## Zakres
- desktop / tabliczki znamionowe: po nieudanym zwykłym `Odczytaj kody` aplikacja automatycznie prostuje obraz i ponawia lokalny odczyt,
- zakres automatycznych kątów: `-18, -15, -12, -9, -6, -3, +3, +6, +9, +12, +15, +18` stopni,
- dla każdego kąta sprawdzany jest obraz normalny oraz kontrastowy,
- retry obejmuje uniwersalny dekoder `barcode-detector` (ZXing), natywny `BarcodeDetector` jeśli jest dostępny oraz lokalny dekoder EAN-13,
- EAN nadal musi przejść checksum EAN-13, a SN może pochodzić tylko z realnego Code 128/Code 39,
- nie dodano OCR ani automatycznego wywołania AI; `Odczytaj przez AI` nadal działa wyłącznie po kliknięciu użytkownika.

## Przypadek zgłoszony
- na załączonym przykładzie widoczny EAN to `5905567600777`; checksum EAN-13 jest poprawny,
- problem wynikał z geometrii/skosu zdjęcia, dlatego 9.28 dodaje automatyczny sweep kątów przed uznaniem skanu za nieudany.

## Supabase
- brak nowego SQL,
- brak zmian Edge Functions.

## Kontrola
- `smoke-desktop-nameplate-deskew-v928` 2x,
- istniejące testy universal reader / automatic fallback / EAN separation / read resilience 2x,
- `verify:release` 2x,
- kontrola integralności ZIP.

## Build lokalny
- próba `npm run build` została wykonana, ale środowisko zatrzymało się na `npm ci` podczas pobierania brakujących zależności (`vite`, `@vitejs/plugin-react`, `rollup`, `esbuild`) i nie doszło do kompilacji Vite w limicie czasu,
- pełny build nie jest oznaczony jako PASS; statyczne testy źródłowe i `verify:release` przeszły.
