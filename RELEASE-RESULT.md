# RELEASE RESULT

## Wersja
- 13.44 (kandydat — oczekuje na zielone CI, Closure Gate i deployment)

## Zakres
- Ręczna synchronizacja oczekujących tabliczek z karty montażu, Centrum synchronizacji i diagnostyki.
- Akcja ponawia zdjęcia, pomija backoff wybranej operacji urządzenia i odświeża montaż po potwierdzeniu serwera.
- Aktywne lease, konflikty i duplikaty numerów seryjnych nadal są chronione. Nie zmieniono schematu, RLS ani danych Supabase.

## Kontrola
- Build lokalny: PASS.
- Nowy Playwright E2E: lokalnie NOT RUN, ponieważ środowisko nie ma Chromium; wymagany w CI.
- PR checks exact SHA, E2E mobile/desktop i Closure Gate: oczekują na wynik CI.
- Produkcyjny deploy/Vercel exact SHA i kontrola PWA na iPhonie: do weryfikacji po zielonym CI.
