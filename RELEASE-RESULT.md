# RELEASE RESULT

## Wersja
- 12.01

## Zakres
- desktop: wyszukiwanie istniejącego kontrahenta po pełnym NIP
- desktop: automatyczny lookup kodu pocztowego po miejscowości/adresie
- desktop: JobFormModal otrzymuje klienta Supabase, więc lookup kodu wykonuje realne zapytanie
- desktop: pole kodu jest kontrolowane i pokazuje wynik od razu
- mobile: zachowane wyszukiwanie po NIP i automatyczny kod pocztowy
- wspólna regresja dla obu wersji formularza

## Kontrola regresji
- smoke: scripts/smoke-job-form-lookups-v1201.cjs
- smoke: scripts/smoke-job-nip-lookup-v1200.cjs
- smoke: scripts/smoke-postal-code-v1196.mjs
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
