# RELEASE RESULT — WAWIS 13.92

## Zakres
- Widoczny tekst daty/godziny nie jest już rysowany przez natywny systemowy widget iOS, który był ucinany mimo poprawnej szerokości ramki. Kompaktowe, wyśrodkowane pola 46 px, format daty DD.MM.RRRR, godzina HH:MM.
- iOS date/time zachowane jako klikalne natywne inputy nad własną warstwą tekstową; żadnych kalendarzy niestandardowych.
- Oba formularze (tworzenie/edycja serwisu) korzystają z tego samego komponentu.
- Lista serwisantów zawiera Piotra Wasika (Administrator) i wszystkich Pracowników. Przy Piotrze jako głównym RPC tworzenia otrzymuje null (ograniczenie do roli Pracownik), a przypisanie następuje przez istniejący chroniony RLS admina po utworzeniu; idempotentność zapisu zachowana.
- Bez zmian bazy, uprawnień, SMS i modułu montażowego.

## Kontrole
- E2E tekstu i geometrii pól na 320/360/375/390/430 px; kontrola widocznego tekstu, pionowego centrowania i interakcji natywnych inputów.
- Smoke resolvera przydziału (sam Piotr, pracownik z Piotrem, brak wyboru).
- CI, WebKit, Closure Gate i build wymagane przed scaleniem.

## Status
Publikacja wyłącznie po zielonym CI.
