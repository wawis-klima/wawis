# RELEASE RESULT

## Wersja
- 12.10

## Zakres
- desktop: status „Faktura VAT”, metoda płatności i „Wystaw fakturę” w jednym wierszu
- neutralny biało-szary przycisk Fakturowni bez mocnego niebieskiego tła i bez ikony dokumentu
- po trwałym potwierdzeniu faktury przez Fakturownię brak ponownej automatycznej weryfikacji tego montażu
- samo wejście w montaż nie uruchamia zapytania weryfikacyjnego do Fakturowni
- mobile, Supabase schema, RLS i Edge Functions bez zmian

## Kontrola regresji
- baseline diagnostyki 24 h: CHECKED (informacyjny)
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
