# RELEASE RESULT

## Wersja
- 11.93

## Zakres
- mobilny generator protokołu PDF: zagęszczenie pionowe bez zmiany nagłówka i kodu QR
- niższa sekcja Realizacja zlecenia
- niższa sekcja Potwierdzenie zapłaty i mniejszy odstęp pod tabelą urządzeń
- adaptacyjna czcionka RODO/odpadów: 9,4 pt → 8,9 pt → 8,5 pt tylko przy braku miejsca
- rezerwacja miejsca na Potwierdzenie klienta przed decyzją o przejściu na drugą stronę
- bez zmian bazy, RLS, Storage, Edge Functions i treści prawnych

## Kontrola regresji
- smoke: scripts/smoke-mobile-protocol-density-v1193.cjs
- diagnostyka produkcyjnej 11.92 / 24 h: 0 błędów, 19 ostrzeżeń
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
