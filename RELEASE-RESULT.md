# RELEASE RESULT

## Wersja
- 10.95

## Zakres
- Mobilny protokół klienta: automatyczne przewinięcie do sekcji `Drukuj lub wyślij` po jej rozwinięciu.
- Sekcja akcji pozostaje nad przyklejonym dolnym paskiem, żeby od razu było widać druk, e-mail i zapis PDF.
- Bez zmian logiki generowania PDF, podpisu, wysyłki e-mail, Supabase, RLS i uprawnień.

## Dowód problemu
Po naciśnięciu dolnego przycisku `Drukuj lub wyślij` sekcja akcji była renderowana niżej, ale pozycja przewijania pozostawała bez zmian. Na telefonie wyglądało to tak, jakby przycisk nie zadziałał.

## Warunek GREEN
- po rozwinięciu sekcji widoczne są akcje protokołu nad sticky footerem,
- regresja mobilnego protokołu przechodzi,
- wymagany `WAWIS PR checks / targeted-checks` jest zielony,
- produkcyjny build przechodzi,
- po merge produkcyjny Vercel dla commita `main` kończy się sukcesem.

## Status
PR #64 przeszedł bramkę `WAWIS PR checks / targeted-checks`; kandydat 10.95 jest gotowy do `main`.
