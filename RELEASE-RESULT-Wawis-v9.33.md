# RELEASE RESULT - Wawis 9.33

## Wersja
- 9.33

## Zakres
- Supabase `500/502/503/504`, timeouty i chwilowe błędy połączenia pokazują `Serwer chwilowo przeciążony — spróbuj ponownie`,
- błąd przejściowy nie czyści lokalnej sesji; aplikacja ponawia przywracanie danych co 5 sekund,
- tylko rzeczywiste `SIGNED_OUT` czyści stan zalogowanego użytkownika,
- `401/403`, RLS i błędy JWT pozostają błędami autoryzacji,
- błąd powiadomienia push nie cofa zapisanego przypisania montera.

## Supabase
- brak nowej migracji SQL,
- brak zmian Edge Functions,
- brak zmian zasad Storage i RLS.

## Kontrola
- test klasyfikacji `500/502/503/504`, timeoutów, `401/403` i RLS: PASS,
- test zachowania sesji przy `504` oraz wylogowania po `SIGNED_OUT`: PASS,
- `smoke-assignment-push`: PASS,
- `smoke-auth-refresh`: PASS,
- produkcyjny build Vite, 244 moduły: PASS.
