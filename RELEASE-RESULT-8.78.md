# RELEASE RESULT

## Wersja
- 8.78

## Tryb
- full / infrastruktura builda

## Wygenerowano
- 2026-07-29T05:33:52.782448Z

## Podsumowanie
- status release: CZĘŚCIOWO ZWERYFIKOWANE
- smoke: 16/16 komend OK
- verify: 2/2 OK
- build: 0/2 OK
- verify:bundle: 0/2 (pominięte, ponieważ nie powstał katalog `dist`)
- ZIP: do wykonania po zapisaniu raportu

## Wprowadzone zmiany
- Dodano projektowy plik `.npmrc` z `registry=https://registry.npmjs.org/`, `include=optional`, `audit=false` i `fund=false`.
- Skrypt `scripts/ensure-build-deps.cjs` przekazuje `npm_config_registry=https://registry.npmjs.org/` bezpośrednio do komend npm uruchamianych podczas builda.
- Dodano test `test:smoke:npm-registry`, który sprawdza konfigurację, wymuszenie rejestru oraz obecność `.npmrc` w końcowym ZIP-ie.
- Test został dodany do pełnego, mobilnego i desktopowego planu wydania.
- Funkcje aplikacji mobilnej, desktop administratora i schemat Supabase pozostały bez zmian.

## Kontrola — dwa przebiegi
| Obszar | Przebieg | Komenda | Wynik |
|---|---:|---|---|
| Smoke | 1/2 | `npm run test:smoke:npm-registry` | OK |
| Smoke | 1/2 | `npm run test:smoke:windows-npm-runner` | OK |
| Smoke | 1/2 | `npm run test:smoke:release-runner` | OK |
| Smoke | 1/2 | `npm run test:smoke:release-zip` | OK |
| Smoke | 1/2 | `npm run test:smoke:release-zip-clean` | OK |
| Smoke | 1/2 | `npm run test:smoke:version` | OK |
| Smoke | 1/2 | `npm run test:smoke:mobile-ui-copy` | OK |
| Smoke | 1/2 | `npm run test:smoke:desktop-only` | OK |
| Verify | 1/2 | `npm run verify:release` | OK |
| Smoke | 2/2 | `npm run test:smoke:npm-registry` | OK |
| Smoke | 2/2 | `npm run test:smoke:windows-npm-runner` | OK |
| Smoke | 2/2 | `npm run test:smoke:release-runner` | OK |
| Smoke | 2/2 | `npm run test:smoke:release-zip` | OK |
| Smoke | 2/2 | `npm run test:smoke:release-zip-clean` | OK |
| Smoke | 2/2 | `npm run test:smoke:version` | OK |
| Smoke | 2/2 | `npm run test:smoke:mobile-ui-copy` | OK |
| Smoke | 2/2 | `npm run test:smoke:desktop-only` | OK |
| Verify | 2/2 | `npm run verify:release` | OK |
| Build | 1/2 | `npm run build` | BLOKADA ŚRODOWISKA |
| Build | 2/2 | `npm run build` | BLOKADA ŚRODOWISKA |

## Wynik prób builda
Wcześniejszy błąd `E404` wewnętrznego rejestru nie wystąpił. npm rozpoczął pobieranie z `https://registry.npmjs.org/`, co potwierdza działanie nowej konfiguracji. Obie próby zatrzymały się z powodu chwilowego braku rozwiązywania DNS (`EAI_AGAIN`) i limitu czasu środowiska wykonawczego. Nie wykryto błędu składni ani błędu kodu aplikacji, ale produkcyjnego katalogu `dist` nie udało się tutaj utworzyć.

## Kontrola lokalna / Vercel
W środowisku z normalnym dostępem do internetu uruchomić:

```bash
npm ci --include=optional
npm run build
```
