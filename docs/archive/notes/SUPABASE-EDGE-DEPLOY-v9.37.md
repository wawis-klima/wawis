# Wdrożenie Supabase Edge Function — Wawis 9.37

Wersja 9.37 nie wymaga migracji SQL. Wymaga ponownego wdrożenia istniejącej funkcji:

`supabase/functions/send-assignment-push/index.ts`

## Zakres wdrożenia

- wdrożyć `send-assignment-push` zwykłą ścieżką projektu Supabase (Dashboard albo używany pipeline),
- zachować ustawienie `verify_jwt = false` z `supabase/config.toml`; funkcja samodzielnie weryfikuje nagłówek `Authorization` przez `auth.getUser()`,
- nie zmieniać sekretów VAPID ani kluczy Supabase, jeśli dotychczasowe push działają.

## Próba po wdrożeniu

1. Administrator włącza powiadomienia push na swoim urządzeniu.
2. Pracownik dodaje komentarz do montażu, do którego ma dostęp.
3. Administrator otrzymuje `Nowy komentarz do montażu`.
4. Kliknięcie powiadomienia otwiera właściwy montaż.
5. Treść komentarza nie jest widoczna na ekranie blokady.
6. Komentarz dodany przez administratora nie wysyła kolejnego push.

Jeśli wysyłka push chwilowo się nie powiedzie, komentarz pozostaje zapisany. Zdarzenie można sprawdzić w logach Edge Function i tabeli `push_delivery_log`.
