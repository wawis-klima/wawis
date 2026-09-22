# RELEASE RESULT

## Wersja
- 11.19

## Tryb
- mobile

## Podsumowanie
- podgląd zdjęcia: blokuje przewijanie karty pod spodem
- iOS: body jest zamrażane w bieżącej pozycji
- overscroll/rubber-band tła: zablokowany
- po zamknięciu: powrót do poprzedniej pozycji
- zmiana danych/RLS/Storage: brak

## Kryteria wydania
- otwarty preview ustawia blokadę przewijania strony
- touch/wheel nie zmienia pozycji karty pod overlayem
- zamknięcie preview przywraca normalne przewijanie
- wymagane: zielony WAWIS PR checks / targeted-checks
