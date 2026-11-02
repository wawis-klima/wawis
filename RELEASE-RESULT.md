# RELEASE RESULT — WAWIS 14.08

## Zakres
- Naklejki QR urządzeń: przypisanie przy montażu (opcjonalne) i w Urządzeniach (administrator), skan aparatem otwiera montaż / klienta.
- Import 324 wydrukowanych kodów (partie 1 i 2).

## Kolejność
1. Migracja `20261102160000_qr_stickers_v1408.sql` (właściciel, SQL Editor) i kontrola SELECT.
2. CI, scalenie, Vercel 14.08.

Aplikacja przed migracją: sekcja naklejek ukryta, montaże działają bez zmian.
