# RELEASE RESULT - Wawis 9.37

## Wersja
- 9.37

## Zakres
- komentarz pracownika wysyła powiadomienie push administratorom z aktywną subskrypcją,
- kliknięcie powiadomienia otwiera właściwy montaż,
- komentarz administratora nie generuje push,
- awaria push nie cofa zapisanego komentarza.

## Supabase
- brak nowej migracji SQL,
- zmieniona Edge Function `send-assignment-push` — wymaga ponownego wdrożenia,
- bez zmian zasad Storage i RLS.

## Kontrola
- `smoke-comment-admin-push`: PASS,
- `smoke-push-reliability`: PASS,
- `smoke-job-completion-tracking-push`: PASS,
- `smoke-assignment-push`: PASS,
- `smoke-push-mobile-reassignment`: PASS,
- `smoke-transient-supabase-errors`: PASS,
- `smoke-release-runner`: PASS,
- kontrola składni TypeScript Edge Function przez parser esbuild: PASS,
- produkcyjny build Vite: PASS — 244 moduły,
- `verify:bundle`: PASS,
- `verify:release`: PASS dla wersji 9.37,
- `smoke-version-ui`: PASS.

## Stan publikacji
- kod aplikacji i Edge Function przygotowany lokalnie,
- Edge Function nie została automatycznie wdrożona do produkcji.
