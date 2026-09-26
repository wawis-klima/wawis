# RELEASE RESULT

## Wersja
- 11.54

## Zakres
- mobilny protokół klienta: poprawne odsłonięcie dolnej części po `Uzupełnij protokół`
- sekcja `Potwierdzenie klienta` ma być w całości widoczna nad sticky footerem
- bez zmian w PDF, podpisie, Supabase, RLS i e-mailu

## Przyczyna poprzednich nietrafionych poprawek
- wcześniejsze wersje sterowały liczbowym `scrollTop`
- na zrzucie problemem nie był sam numer przewinięcia, tylko to, że dół sekcji `Potwierdzenie klienta` pozostawał zasłonięty przez sticky footer
- 11.54 przewija konkretny element przez `scrollIntoView`, więc Safari wybiera właściwego przodka przewijania

## Naprawa
- po wejściu w edycję mierzona jest rzeczywista wysokość dolnego paska
- sekcji `Potwierdzenie klienta` ustawiany jest `scroll-margin-bottom = wysokość footera + 16 px`
- następnie wykonywane jest `scrollIntoView({ block: "end" })`
- po 140 ms pozycja jest ponawiana dla iOS
- E2E sprawdza bezpośrednio odstęp między dołem sekcji a górą footera

## Wynik wydania
- WAWIS PR checks: PENDING
- produkcyjny build: PENDING
- Vercel: PENDING
- merge: PENDING
