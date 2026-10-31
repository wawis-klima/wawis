# RELEASE RESULT — WAWIS 14.03

## Zakres
- Zdjęcia serwisu 1:1 jak w montażach: inicjały autora, krótka data, „Usuń” także po podpisaniu.
- Serwer chroni jedyne zdjęcie usterki w podpisanym protokole; Kosz, audyt i ochrona PDF/podpisu bez zmian.

## Kolejność
1. Migracja `20261031160000_service_visit_photo_delete_like_jobs_v1403.sql` (właściciel, SQL Editor) i kontrola SELECT.
2. `ready_for_main=true`, CI, scalenie, Vercel 14.03.
