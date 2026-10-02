# RELEASE RESULT

## Wersja
- 12.26

## Zakres
- pracownik musi przygotować protokół przed zakończeniem montażu;
- protokół można otworzyć, wypełnić, podpisać i zapisać przy statusie „W trakcie”;
- bez zapisanego protokołu przycisk „Zakończ” pozostaje nieaktywny;
- baza również blokuje zmianę pracownika na „Zakończone” bez protokołu;
- nadal wymagany jest kompletny zestaw tabliczek JW/JZ;
- administrator zachowuje możliwość zakończenia bez protokołu;
- po zakończeniu protokół nadal można ponownie otworzyć i podpisać.

## Baza / backend
- nowa funkcja `current_user_can_write_job_protocol`;
- RLS i Storage pozwalają zapisać protokół dla zlecenia „W trakcie”;
- trigger zakończenia wymaga od pracownika podpisanego rekordu protokołu i istniejącego pliku PDF;
- service role i administrator zachowują dotychczasowe ścieżki administracyjne.

## Diagnostyka startowa
- CHECKED — 24 h;
- 23 error i 59 warning;
- baseline informacyjny.

## Kontrola regresji
- `scripts/smoke-worker-protocol-gate-v1226.cjs`: PENDING CI
- `test:smoke:mobile-protocol`: PENDING CI
- mobile E2E: PENDING CI
- migracja produkcyjna: PENDING
- Vercel: PENDING
- merge: PENDING
