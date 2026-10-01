# RELEASE RESULT

## Wersja
- 12.12

## Zakres
- desktop: stary błąd szczegółów z poprzedniego wejścia nie blokuje nowego odczytu
- przy ponownym otwarciu zlecenia stary komunikat jest czyszczony
- nowy cykl ładowania uruchamia się automatycznie, z timeoutem 12 s i retry z 12.11
- zabezpieczenie per otwarcie zapobiega pętli automatycznych prób
- mobile bez zmian funkcjonalnych
- Supabase schema, RLS i Edge Functions bez zmian

## Kontrola regresji
- smoke desktop resilience zaktualizowany o ponowne otwieranie po starym błędzie
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
