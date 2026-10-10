# RELEASE RESULT

## Wersja
- 12.94

## Tryb
- mobile

## Zakres
- Profil potwierdzony przez Supabase i montaże pobierają się równocześnie.
- Niepotwierdzony profil po timeout 504 nie odblokowuje uprawnień.
- Przy wolnym serwerze po 7 sekundach komunikat i ręczny retry bez kasowania danych.
- Regresja dwóch kolejności odpowiedzi i timeoutu 504.

## Dowód
- Wymagany zielony PR CI dla dokładnego SHA, testy Playwright, Closure Gate, build oraz weryfikacja produkcyjnego wdrożenia i wersji 12.94.
