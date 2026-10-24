# RELEASE RESULT

## Wersja
- 13.61 — ikona ekranu początkowego WAWIS (PWA), oczekuje na zielony CI oraz potwierdzenie po deployu na iPhonie.

## Zakres
- Dodano oddzielną kwadratową ikonę z zaakceptowanym napisem WAWIS i niebieskim pierścieniem.
- Manifest PWA oraz apple-touch-icon, favicon i shortcut icon wskazują nową ikonę.
- Dotychczasowe firmowe `public/logo.png` pozostaje nienaruszone. Bez zmian w protokołach, zdjęciach, RLS, auth, PUSH, synchronizacji i backendzie.

## Kontrola
- Wymagane zielone WAWIS PR checks przed merge, następnie Vercel READY i kontrola prawdziwego dodania na ekran iPhone.
- Instalacji działającej offline nie usuwać przed upewnieniem się, że ma zsynchronizowane dane.
