# RELEASE RESULT

## Wersja
- 13.43 (kandydat — oczekuje na zielone CI, Closure Gate i deployment)

## Zakres
- Offline zapis urządzeń i tabliczek znamionowych w edycji administratora i pracownika, pod warunkiem że pozostałe dane montażu nie zostały zmienione.
- Zdjęcia tabliczek są zapisywane w lokalnej kolejce; synchronizacja urządzenia czeka na dokładne ścieżki potwierdzone po stronie serwera.
- Duplikaty numerów seryjnych pozostają konfliktem. Nie zmieniono schematu, RLS ani danych Supabase.

## Kontrola
- Build i lokalne testy smoke/regresji bez przeglądarki: PASS.
- Playwright E2E: wymagany w CI; lokalne środowisko nie ma Chromium.
- PR checks exact SHA, E2E mobile/desktop i Closure Gate: oczekują na wynik CI.
- Produkcyjny deploy/Vercel exact SHA i kontrola PWA na iPhonie: do weryfikacji po zielonym CI.
