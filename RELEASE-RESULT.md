# RELEASE RESULT

## Wersja
- 10.99

## Zakres
- PUSH pozostaje aktywny wyłącznie w aplikacji mobilnej.
- Desktop nie inicjalizuje `usePushNotificationsState` i nie renderuje kontrolki PUSH.
- Aktywne subskrypcje Windows zostały bezpiecznie dezaktywowane na produkcji.
- iPhone i Android oraz szczegółowe powiadomienia mobilne pozostają bez zmian.
- Bez migracji SQL, zmian RLS i zmian Edge Function.

## Warunek GREEN
- regresje PUSH 10.97/10.98 nadal przechodzą po zmianie kontraktu desktopowego,
- `smoke-desktop-push-disabled-v1099.cjs` potwierdza brak inicjalizacji PUSH na desktopie i zachowanie PUSH mobile,
- grupa PUSH, wymagane E2E i produkcyjny build przechodzą,
- po merge produkcyjny Vercel dla `main` kończy się sukcesem.

## Status
Kandydat 10.99 oznaczony jako `ready_for_main`; merge nastąpi wyłącznie po zielonej bramce PR.
