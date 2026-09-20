# RELEASE RESULT

## Wersja
- 10.98

## Zakres
- Naprawa mylącego OFF przy pierwszym renderze kontrolki PUSH.
- Ostatni zweryfikowany stan PUSH jest zapisywany w trwałym cache per użytkownik i urządzenie.
- Brak cache oznacza neutralne „sprawdzanie”, a nie OFF; kontrolka jest wtedy chwilowo zablokowana.
- Ręczne ON/OFF z 10.97 pozostaje bez zmian i po synchronizacji aktualizuje trwały cache.
- Bez migracji SQL, zmian RLS i zmian Edge Function.

## Warunek GREEN
- regresje `smoke-push-toggle-v1097.cjs` oraz `smoke-push-initial-state-v1098.cjs` przechodzą,
- grupa PUSH i testy krytyczne przechodzą,
- wymagane E2E mobile i desktop przechodzą,
- produkcyjny build przechodzi,
- po merge produkcyjny Vercel dla `main` kończy się sukcesem.

## Status
Kandydat 10.98 oznaczony jako `ready_for_main`; merge nastąpi wyłącznie po zielonej bramce PR.
