# RELEASE RESULT — WAWIS 14.06

## Zakres
- SMS: klient objęty już wysłanym SMS-em grupy nie jest pokazywany jako „do wysłania” (snapshot zwraca wpisy aktywnych grup).
- Wysyłka zaznaczonych: odmowa jednego klienta nie zatrzymuje pozostałych; lista odrzuconych z powodem.

## Kolejność
1. Migracja `20261102090000_sms_snapshot_group_window_v1406.sql` (właściciel, SQL Editor; tylko odczytowa funkcja) i kontrola SELECT.
2. CI, scalenie, Vercel 14.06.

Kod 14.06 działa poprawnie także przed migracją (pozostali klienci są wysyłani); migracja usuwa z listy klientów już objętych SMS-em.
