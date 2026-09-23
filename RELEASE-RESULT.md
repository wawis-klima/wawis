# RELEASE RESULT

## Wersja
- 11.21

## Tryb
- full / push-navigation hotfix

## Zakres
- mobile i desktop: deep-link `?jobId=...` po kliknięciu PUSH
- automatyczne przełączenie filtra na status wskazanego zlecenia
- otwarcie właściwej strony listy i szczegółów montażu
- jednorazowe usunięcie `jobId` z URL po obsłużeniu
- bez zmian Supabase / RLS / Storage / danych

## Kryteria wydania
- `WAWIS PR checks / targeted-checks` musi być zielony
- regresja `test:smoke:push-job-deeplink` musi przejść
- istniejące testy PUSH i zakończenia zlecenia muszą pozostać zielone
- Playwright mobile i desktop oraz produkcyjny build muszą przejść

## Wynik wdrożenia
- WAWIS PR checks: PASS
- targeted regressions: PASS
- regresja `test:smoke:push-job-deeplink`: PASS
- Playwright mobile: PASS
- Playwright desktop: PASS
- produkcyjny build: PASS
- Supabase / RLS / Storage: N/A — brak zmian
- Vercel deployment: SUCCESS dla merge `5c5e8213b6c74cad94f29b6ef3a1fb0840020d5d`
- centralna diagnostyka po wdrożeniu: brak nowych `error`/`warning` w `app_diagnostic_events` w kontroli ostatnich 30 minut
- bezpośredni odczyt deploymentu przez konektor Vercela: niedostępny z powodu braku autoryzacji scope `wawis`; status wdrożenia potwierdzony przez integrację Vercel w GitHub
- merge produkcyjny: `5c5e8213b6c74cad94f29b6ef3a1fb0840020d5d`
