# RELEASE RESULT

## Wersja
- 8.27

## Tryb
- manual-desktop

## Wygenerowano
- 2026-05-26T06:21:19.230Z

## Podsumowanie
- status release: OK
- smoke: 2 komend OK
- verify: 2/2 OK
- build: 2/2 OK
- verify:bundle: 2/2 OK
- ZIP: OK

## Kroki
| Obszar | Przebieg | Komenda | Wynik |
|---|---:|---|---|
| Smoke | 1/2 | `manual smoke pass 1` | OK |
| Smoke | 2/2 | `manual smoke pass 2` | OK |
| Verify | 1/2 | `npm run verify:release` | OK |
| Verify | 2/2 | `npm run verify:release` | OK |
| Build | 1/2 | `npm run build` | OK |
| Build | 1/2 | `npm run verify:bundle` | OK |
| Build | 2/2 | `npm run build` | OK |
| Build | 2/2 | `npm run verify:bundle` | OK |
| Package | 1/2 | `npm run zip:release` | OK |
| Package | 1/2 | `node scripts/verify-release.cjs --require-zip` | OK |
