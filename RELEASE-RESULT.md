# RELEASE RESULT

## Wersja
- 12.24

## Zakres
- listy montaży w statusie „Zakończone” pokazują datę zakończenia zamiast daty montażu;
- desktop zmienia nagłówek kolumny na „Data zakończenia”;
- mobile pokazuje `completed_at` na karcie zakończonego montażu;
- sortowanie daty dla zakończonych używa `completed_at`;
- pozostałe statusy nadal używają `installation_date`;
- brak `completed_at` w starym zakończonym zleceniu daje „Brak daty”, bez fallbacku do daty montażu.

## Baza / backend
- brak migracji;
- brak zmian RLS, Storage, Edge Functions i danych produkcyjnych.

## Diagnostyka startowa
- CHECKED — 24 h przed zmianą;
- 16 zdarzeń error i 51 warning w `app_diagnostic_events`;
- baseline jest informacyjny i nie blokuje wydania.

## Kontrola regresji
- `test:smoke:selection`: PENDING CI
- pozostałe testy dobrane przez `release-impact`: PENDING CI
- Vercel: PENDING
- merge: PENDING
