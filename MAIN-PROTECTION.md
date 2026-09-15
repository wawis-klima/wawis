# WAWIS — ochrona gałęzi `main`

Kod aplikacji dodatkowo chroni Vercel przez `vercel-deploy-guard.cjs` oraz `release-policy-gate.cjs --deploy`, ale GitHub musi również blokować przypadkowe bezpośrednie zmiany `main`.

## Wymagany GitHub Ruleset dla `main`

Dla gałęzi `main` ustaw:

1. **Require a pull request before merging** — włączone.
2. **Require status checks to pass before merging** — włączone.
3. Wymagany status: `WAWIS PR checks / targeted-checks`.
4. Finalne wydanie musi mieć osobny zielony `WAWIS final release checks` uruchomiony na `release/v<WERSJA>` i zapisany w `RELEASE-GATE.json`.
5. **Block force pushes** — włączone.
6. **Block branch deletion** — włączone.
7. **Do not allow bypassing the above settings** — włączone, jeśli dostępne dla planu/konta.
8. **Require approvals** i **Code Owners review** włączaj tylko wtedy, gdy istnieje drugi realny reviewer. Przy jednym koncie właściciela nie wolno tworzyć blokady, której nie da się legalnie spełnić.

## Dlaczego trzy poziomy ochrony

- GitHub Ruleset chroni proces wejścia kodu na `main` i wymusza zielony PR check.
- `vercel.json` wyłącza automatyczne deploye wszystkich gałęzi roboczych (`*` i `**/*`) i zostawia tylko `main`.
- `scripts/vercel-deploy-guard.cjs` odrzuca build, jeżeli Vercel mimo wszystko uruchomi go poza `production` albo z gałęzi innej niż `main`.
- `scripts/release-policy-gate.cjs --deploy` dodatkowo wymaga gotowego release, diagnostyki GO, zweryfikowanego ZIP-a na Drive i `ready_for_main=true`.

## Zasada operacyjna

Testy, Playwright, build kontrolny, weryfikacja i ZIP odbywają się w GitHub Actions na gałęzi release. Nie potrzebują Preview Vercela. Vercel ma zostać użyty dopiero po gotowym merge do `main`, zasadniczo raz na wydanie. Po produkcji GitHub Actions wykonuje post-deploy evidence; nie wymaga to kolejnego builda Vercela.

## Uwaga techniczna

Ustawienia GitHub Ruleset wymagają uprawnień administracyjnych repozytorium. Nie są zmieniane przez zwykły commit w kodzie; należy je ustawić jednorazowo w GitHub Settings → Rules → Rulesets. Po ustawieniu pozostają aktywne dla kolejnych wydań.
