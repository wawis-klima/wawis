# WAWIS — ochrona gałęzi `main`

Kod aplikacji dodatkowo chroni Vercel przez `release-policy-gate.cjs --deploy`, ale GitHub powinien również blokować przypadkowe bezpośrednie zmiany `main`.

## Zalecany GitHub Branch Protection / Ruleset

Dla gałęzi `main` ustaw:

1. **Require a pull request before merging** — włączone.
2. **Require approvals** — minimum 1, jeśli plan/konto GitHuba na to pozwala.
3. **Require review from Code Owners** — włączone, jeśli dostępne; `.github/CODEOWNERS` wskazuje `@wawis-klima`.
4. **Require status checks to pass before merging** — włączone.
5. Wymagany szybki status: `WAWIS PR checks / targeted-checks`.
6. Finalne wydanie nadal musi mieć osobny zielony `WAWIS final release checks` uruchomiony na `release/v<WERSJA>` i zapisany w `RELEASE-GATE.json`.
7. **Do not allow bypassing the above settings** — włączone, jeśli dostępne.
8. **Block force pushes** — włączone.
9. **Block branch deletion** — włączone.

## Dlaczego dwa poziomy ochrony

- GitHub Ruleset chroni historię i proces merge do `main`.
- `vercel.json` uruchamia `release-policy-gate.cjs --deploy`, więc nawet jeśli niegotowy commit trafi na `main`, produkcyjny build zostanie zatrzymany bez finalnego ZIP-a Drive i `ready_for_main=true`.

## Uwaga techniczna

Ustawienia Branch Protection wymagają uprawnień administracyjnych repozytorium. Nie są zmieniane przez zwykły commit w kodzie; należy je ustawić jednorazowo w GitHub Settings → Rules / Branches. Po ustawieniu pozostają aktywne dla kolejnych wydań.
