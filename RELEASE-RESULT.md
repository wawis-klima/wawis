# RELEASE RESULT

## Wersja
- 12.11

## Zakres
- desktop: limit odczytu szczegółów montażu zwiększony z 7 s do 12 s
- timeout lub błąd sieciowy uruchamia automatyczne ponowienie po 1,5 s
- komunikat „Ponów” jest pokazywany dopiero po nieudanej automatycznej próbie
- diagnostyka zapisuje retry, odzyskanie i końcowy błąd szczegółów montażu
- mobile bez zmian funkcjonalnych
- Supabase schema, RLS i Edge Functions bez zmian

## Kontrola regresji
- smoke desktop resilience zaktualizowany o timeout 12 s i auto-retry
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
