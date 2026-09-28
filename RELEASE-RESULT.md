# RELEASE RESULT

## Wersja
- 11.72

## Zakres
- mobilne logowanie natychmiast przechodzi do aplikacji i pokazuje stan ładowania danych
- bez danych lokalnych: „Ładowanie danych…”
- z lokalnym snapshotem / istniejącym stanem: „Odświeżanie danych…”
- chwilowe timeouty/5xx po logowaniu są automatycznie ponawiane do 3 razy co 3 s
- podczas retry bez danych wskaźnik ładowania pozostaje widoczny
- po SIGNED_IN nie uruchamia się drugi pełny refresh; logowanie i restore mają własny pojedynczy refresh
- istniejące dane pozostają na ekranie podczas problemu przejściowego
- bez zmian w Supabase, RLS, Storage i Edge Functions

## Dowód incydentu
- produkcja Supabase: ACTIVE_HEALTHY
- na iPhone administratora odnotowano `refreshAll failed`
- późniejsze logowanie Auth: HTTP 200, ok. 0,9 s
- w tej samej minucie: jobs ~7,9 s, job_access ~10,3 s, profile ~6,6–8,9 s, notifications ~9,7 s
- minutę później żądania wróciły do <1 s
- wniosek: krótkie spowolnienie po stronie usług, nie utrata danych i nie błąd autoryzacji

## Kontrola regresji
- cache-first nadal pokazuje lokalny snapshot przed serwerem
- test wymaga widocznego loading state
- test wymaga automatycznego transient retry i limitu prób
- test zabrania dublowania pełnego refreshu przez SIGNED_IN
- wersja/cache PWA: 11.72

## Wynik wydania
- WAWIS PR checks: PENDING
- produkcyjny build: PENDING
- Vercel: PENDING
- merge: PENDING
