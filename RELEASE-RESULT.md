# RELEASE RESULT

## Wersja
- 12.13

## Zakres
- desktop: faktura VAT, płatność i Fakturownia tylko dla zakończonych montaży
- Nowe / W trakcie / Niezrealizowane nie pokazują paska fakturowego
- akcje fakturowe są logicznie zablokowane przed zakończeniem zlecenia
- kolumna FV w tabeli jest pusta dla niezakończonych montaży
- mobile bez zmian funkcjonalnych
- Supabase schema, RLS i Edge Functions bez zmian

## Kontrola regresji
- smoke desktop VAT rozszerzony o warunek statusu Zakończone
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
