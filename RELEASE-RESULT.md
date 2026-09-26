# RELEASE RESULT

## Wersja
- 11.51

## Zakres
- mobilny protokół klienta: korekta pozycji po naciśnięciu `Uzupełnij protokół`
- po przebudowaniu formularza przewinięcie cofa się o wysokość nagłówka kreatora
- bez zmian w PDF, podpisie, Supabase, RLS i e-mailu

## Dowód błędu
- na obrazie zgłoszonym z iPhone'a formularz po wejściu w edycję zatrzymuje się około 50 CSS px za nisko
- obraz docelowy pokazuje tę samą zawartość przesuniętą o wysokość mobilnego nagłówka w górę

## Naprawa
- przed przejściem do edycji zapamiętywany jest `scrollTop`
- po dwóch klatkach renderowania wyliczana jest rzeczywista wysokość nagłówka
- modal ustawia `scrollTop = poprzednia pozycja - wysokość nagłówka`, bez animacji
- dodana regresja E2E pilnująca tej geometrii

## Wynik wydania
- WAWIS PR checks: PENDING
- produkcyjny build: PENDING
- Vercel: PENDING
- Cloudflare: PENDING
- merge: PENDING
