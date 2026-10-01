# RELEASE RESULT

## Wersja
- 12.07

## Zakres
- poprawka bezpieczeństwa integracji GUS BIR
- usunięcie wartości kluczy dostępowych z testu regresyjnego
- pozostawienie wyłącznie referencji do sekretu GUS_BIR_API_KEY
- funkcjonalność lookupu NIP bez zmian względem 12.06
- wymagane unieważnienie/zmiana dotychczasowego klucza przed uruchomieniem provider lookup

## Kontrola regresji
- smoke: scripts/smoke-gus-bir-v1206.cjs
- WAWIS PR checks / targeted-checks: PENDING
- Supabase Edge Function gus-bir-lookup: ACTIVE, verify_jwt=true
- nowy sekret GUS_BIR_API_KEY: PENDING po rotacji klucza
- Vercel: PENDING
- merge: PENDING
