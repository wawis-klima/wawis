# RELEASE RESULT

## Wersja
- 11.52

## Zakres
- mobilny protokół klienta: przewinięcie do absolutnego końca po `Uzupełnij protokół`
- wykrywanie faktycznie aktywnego scroll-containera po przebudowaniu widoku
- bez zmian w PDF, podpisie, Supabase, RLS i e-mailu

## Dowód błędu
- w 11.51 po wejściu do edycji zmniejszaliśmy `scrollTop`, czyli przesuwaliśmy widok w przeciwną stronę niż wymagało zgłoszenie
- na realnym iPhonie formularz nadal zatrzymywał się przed samym dołem

## Naprawa
- po wejściu w edycję aplikacja czeka na ustabilizowanie layoutu
- wybiera kontener z największym realnym zakresem przewijania
- ustawia `scrollTop` na dokładne maksimum `scrollHeight - clientHeight`
- powtarza ustawienie po 120 ms, aby skompensować iOS scroll anchoring
- regresja E2E sprawdza osiągnięcie maksymalnego scrolla

## Wynik wydania
- WAWIS PR checks: PENDING
- produkcyjny build: PENDING
- Vercel: PENDING
- merge: PENDING
