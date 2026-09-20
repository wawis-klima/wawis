# RELEASE RESULT

## Wersja
- 10.97

## Zakres
- Przycisk PUSH na mobile i desktopie działa jako przełącznik ON/OFF.
- OFF dezaktywuje bieżącą subskrypcję na serwerze i lokalnie oraz zapisuje preferencję użytkownika na urządzeniu.
- Automatyczna naprawa subskrypcji respektuje ręczne OFF i nie włącza PUSH ponownie po odświeżeniu.
- ON ponownie prosi o zgodę systemową, jeśli jest potrzebna, i rejestruje aktualny endpoint.
- Bez migracji SQL, zmian RLS i zmian Edge Function.

## Warunek GREEN
- regresja `smoke-push-toggle-v1097.cjs` przechodzi,
- grupa PUSH i testy krytyczne przechodzą,
- wymagane E2E mobile i desktop przechodzą,
- produkcyjny build przechodzi,
- po merge produkcyjny Vercel dla `main` kończy się sukcesem.

## Status
Kandydat 10.97 oznaczony jako `ready_for_main`; merge nastąpi wyłącznie po zielonej bramce PR.
