# RELEASE RESULT

## Wersja
- 11.91

## Zakres
- mobile: Potwierdzenie zapłaty zawsze aktywne
- mobile: usunięty przełącznik Dodaj / Dodane
- mobile: formularz płatności widoczny od razu w protokole
- zapis protokołu wymaga wyboru Gotówka albo Przelew
- Gotówka wymaga kwoty > 0
- Przelew może być bez kwoty
- bez zmian bazy, RLS i Edge Functions

## Kontrola regresji
- smoke: brak protocolPaymentToggle i stałe enabled=true w workflow protokołu
- unit: brak wybranego sposobu płatności blokuje zapis
- E2E: formularz płatności jest widoczny bez wcześniejszego kliknięcia Dodaj
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
