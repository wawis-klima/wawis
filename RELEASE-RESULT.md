# RELEASE RESULT

## Wersja
- 11.08

## Tryb
- mobile

## Wygenerowano
- 2026-09-21T15:17:09.367Z

## Podsumowanie
- status lokalny: CZĘŚCIOWY — oczekuje na CI
- tryb: mobile
- grupy regresji: 10 zakończonych grup
- Playwright E2E: 0 zakończonych przebiegów
- build: OK
- verify:bundle: OK
- verify:release: OK
- CSS dystrybucji: OK

## Kroki
| Obszar | Komenda | Wynik |
|---|---|---|
| Tests:core | `node scripts/run-test-group.cjs core` | OK |
| Tests:jobs | `node scripts/run-test-group.cjs jobs` | OK |
| Tests:photos | `node scripts/run-test-group.cjs photos` | OK |
| Tests:protocol | `node scripts/run-test-group.cjs protocol` | OK |
| Tests:roles | `node scripts/run-test-group.cjs roles` | OK |
| Tests:push | `node scripts/run-test-group.cjs push` | OK |
| Tests:fuel | `node scripts/run-test-group.cjs fuel` | OK |
| Tests:nameplates | `node scripts/run-test-group.cjs nameplates` | OK |
| Tests:mobile | `node scripts/run-test-group.cjs mobile` | OK |
| Tests:infra | `node scripts/run-test-group.cjs infra` | OK |
| E2E:mobile | `npm run test:e2e:mobile` | OCZEKUJE NA CI — lokalnie brak Chromium |
| Build | `npm run build` | OK |
| Bundle | `npm run verify:bundle` | OK |
| CSS dystrybucji | `npm run test:smoke:dist-mobile-css` | OK |
| Spójność wydania | `npm run verify:release` | OK |


## Kontrola CI
Lokalny Playwright nie uruchomił przeglądarki, ponieważ obraz roboczy nie zawiera pliku wykonywalnego Chromium. To ograniczenie środowiska, a nie błąd aplikacji. Pełny mobilny E2E pozostaje obowiązkową bramką w GitHub Actions przed scaleniem. Lokalnie przeszły wszystkie 10 grup regresji, build, kontrola pakietu, CSS dystrybucji oraz test 11.08 nagłówka, adresu i komentarzy.
