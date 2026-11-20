# RELEASE RESULT

## Wersja
- 8.76

## Tryb
- mobile

## Wygenerowano
- 2026-07-29T04:58:07.455Z

## Podsumowanie
- status release: BŁĄD
- smoke: 26 komend OK
- verify: 2/2 OK
- build: 0/2 OK
- verify:bundle: 0/2 OK
- ZIP: OK

## Kroki
| Obszar | Przebieg | Komenda | Wynik |
|---|---:|---|---|
| Smoke | 1/2 | `npm run test:smoke:mobile-ui-copy` | OK |
| Smoke | 1/2 | `npm run test:smoke:mobile-serial-scanner` | OK |
| Smoke | 1/2 | `npm run test:smoke:nameplate-finish-verification` | OK |
| Smoke | 1/2 | `npm run test:smoke:mobile-offline-photo-queue` | OK |
| Smoke | 1/2 | `npm run test:smoke:mobile-photo-sync-indicator` | OK |
| Smoke | 1/2 | `npm run test:smoke:nameplate-rendering` | OK |
| Smoke | 1/2 | `npm run test:smoke:e2e-mobile` | OK |
| Smoke | 1/2 | `npm run test:smoke:version` | OK |
| Smoke | 1/2 | `npm run test:smoke:desktop-only` | OK |
| Smoke | 1/2 | `npm run test:smoke:desktop-nameplate-ai-barcode` | OK |
| Smoke | 1/2 | `npm run test:smoke:release-runner` | OK |
| Smoke | 1/2 | `npm run test:smoke:release-zip` | OK |
| Smoke | 1/2 | `npm run test:smoke:release-zip-clean` | OK |
| Verify | 1/2 | `npm run verify:release` | OK |
| Build | 1/2 | `npm run build` | BŁĄD |
| Smoke | 2/2 | `npm run test:smoke:mobile-ui-copy` | OK |
| Smoke | 2/2 | `npm run test:smoke:mobile-serial-scanner` | OK |
| Smoke | 2/2 | `npm run test:smoke:nameplate-finish-verification` | OK |
| Smoke | 2/2 | `npm run test:smoke:mobile-offline-photo-queue` | OK |
| Smoke | 2/2 | `npm run test:smoke:mobile-photo-sync-indicator` | OK |
| Smoke | 2/2 | `npm run test:smoke:nameplate-rendering` | OK |
| Smoke | 2/2 | `npm run test:smoke:e2e-mobile` | OK |
| Smoke | 2/2 | `npm run test:smoke:version` | OK |
| Smoke | 2/2 | `npm run test:smoke:desktop-only` | OK |
| Smoke | 2/2 | `npm run test:smoke:desktop-nameplate-ai-barcode` | OK |
| Smoke | 2/2 | `npm run test:smoke:release-runner` | OK |
| Smoke | 2/2 | `npm run test:smoke:release-zip` | OK |
| Smoke | 2/2 | `npm run test:smoke:release-zip-clean` | OK |
| Verify | 2/2 | `npm run verify:release` | OK |
| Build | 2/2 | `npm run build` | BŁĄD |
| Package | 1/2 | `npm run zip:release` | OK |
| Package | 1/2 | `node scripts/verify-release.cjs --require-zip` | OK |


## Błąd
`Dwa przebiegi builda nie mogły pobrać brakujących zależności, ponieważ wewnętrzny rejestr npm zwrócił E404 dla yallist oraz @vitejs/plugin-react. Testy kodu, ochrona desktopu, verify:release i kontrola ZIP przeszły w obu wymaganych przebiegach.`
