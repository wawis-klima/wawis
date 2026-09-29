# RELEASE RESULT

## Wersja
- 11.75

## Zakres
- audyt Kontrahentów: etap 2 / K8 + K9 + K15
- K8: aktywna edycja kontrahenta na desktopie nie jest już ponownie seedowana po zmianie jobs/katalogu; niezapisany draft pozostaje nietknięty
- K9: desktop i mobile unieważniają odczyt listy rozpoczęty przed zapisem/usunięciem i po potwierdzonej mutacji wykonują jeden kontrolowany świeży odczyt
- K9: unieważnienie domyka stan loading; stara odpowiedź nie może nadpisać potwierdzonego lokalnego wyniku
- K15: desktopowa lista urządzeń ma stan `{ contractorId, rows, status }`
- K15: po A→B poprzednie urządzenia są czyszczone natychmiast, a akcja edycji jest blokowana dla wyniku należącego do innego contractorId
- K15: poprawna pusta odpowiedź jest wynikiem „0 urządzeń”, a fallback nie wskrzesza urządzeń z poprzedniego klienta
- zachowana ochrona requestów po zmianie konta/odmontowaniu komponentu
- bez migracji Supabase, bez zmian RLS, Storage i Edge Functions

## Kontrola regresji
- nowy `scripts/smoke-contractors-async-v1175.mjs` sprawdza K8/K9/K15
- smoke wykonuje behawioralny scenariusz generacji requestów: stary load po invalidate nie może commitować, nowy load może
- grupy desktop i mobile uruchamiają nową regresję
- pełne WAWIS PR checks / Playwright / build: PENDING
- wersja/cache PWA: 11.75

## Wynik wydania
- WAWIS PR checks: PENDING
- Playwright mobile/desktop: PENDING
- produkcyjny build: PENDING
- Vercel: PENDING
- merge: PENDING
