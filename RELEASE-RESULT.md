# RELEASE RESULT

## Wersja
- 11.52

## Zakres
- mobilny protokół klienta: automatyczne przewinięcie do absolutnego dołu po `Uzupełnij protokół`
- wykrywanie faktycznie przewijanego kontenera iOS/Safari
- bez zmian w PDF, podpisie, Supabase, RLS i e-mailu

## Dowód błędu
- 11.51 próbowała korygować pozycję względnie, zamiast wymusić końcową pozycję formularza
- na iPhonie Safari może używać modala albo jego overlay jako rzeczywistego scroll-containera
- przez to formularz nadal zatrzymywał się nad końcem i wymagał ręcznego dociągnięcia

## Naprawa
- po wejściu w edycję aplikacja czeka na przebudowanie widoku
- porównuje zakres przewijania modala i overlay
- wybiera kontener z największym realnym zakresem i ustawia `scrollTop` na jego `scrollHeight - clientHeight`
- po 120 ms ponawia ustawienie, aby iOS nie cofnął pozycji
- regresja E2E wymaga od teraz absolutnego dołu

## Wynik wydania
- WAWIS PR checks: PENDING
- produkcyjny build: PENDING
- Vercel: PENDING
- merge: PENDING
