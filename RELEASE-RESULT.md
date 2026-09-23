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
- WAWIS PR checks: PENDING
- targeted regressions: PENDING
- Playwright mobile: PENDING
- Playwright desktop: PENDING
- produkcyjny build: PENDING
- Vercel deployment: PENDING
- centralna diagnostyka po wdrożeniu: PENDING
- merge produkcyjny: PENDING
