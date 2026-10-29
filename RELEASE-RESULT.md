# RELEASE RESULT — WAWIS 13.95

## Zakres
- Admin w Koszu może wybrać „Usuń na stałe”. Wymagane dokładne wpisanie USUN i drugie potwierdzenie.
- Operacja usuwa tylko tę wizytę i jej zawartość: zdjęcia, podpis, PDF ze Storage, wyniki urządzeń, logi wysyłki, przypisania i kolejki PUSH.
- Backend: autentykacja sesji, kontrola roli Administrator, stan kosza, klucz service_role tylko po stronie Edge; usuwanie przez Supabase Storage API, potem SQL finalize w jednej transakcji.
- Jeśli Storage nie potwierdzi pustego folderu wizyty, wpisy w bazie nie są usuwane. Możliwa ponowna próba, bez przywrócenia rozpoczętego purge.
- Dane klienta, oryginalne urządzenia, montaże i inne przeglądy bez zmian.

## Kontrola wydania
- Regressions: RPC deny-by-default, scope prefiksu UUID, Storage API, kolejność usunięcia, dwustopniowe potwierdzenie.
- GitHub PR checks, Playwright/WebKit, Closure Gate, Vercel READY, wdrożone RPC i Edge Function.
- Żadnego testowego kasowania istniejących serwisów produkcyjnych.
