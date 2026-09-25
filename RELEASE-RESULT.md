# RELEASE RESULT

## Wersja
- 11.40

## Tryb
- mobile / standard

## Zakres
- pracownik mobilny może edytować dane klienta w aktywnym montażu: nazwa, telefon, e-mail, miejscowość i ulica/numer
- zapis pracownika nie wysyła pól administratora
- zakończone zlecenia pozostają zablokowane dla edycji pracownika
- wydruk protokołu dla Phomemo M832 wraca do pełnego A4 210 × 297 mm
- jednostronicowy protokół renderuje się bez dodatkowego dużego canvasa
- bez zmian Supabase / RLS / Storage / Edge Functions

## Kryteria wydania
- `WAWIS PR checks / targeted-checks` musi być zielony
- regresja `test:smoke:worker-shared-job-edit` musi przejść
- regresja `test:smoke:mobile-protocol-print` musi przejść
- wymagane E2E oraz produkcyjny build muszą przejść

## Wynik wdrożenia
- WAWIS PR checks: PENDING
- targeted regressions: PENDING
- produkcyjny build: PENDING
- Supabase / RLS / Storage: N/A — brak zmian
- deployment produkcyjny: PENDING
- merge produkcyjny: PENDING
