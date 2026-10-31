# RELEASE RESULT — WAWIS 14.04

## Zakres
- Wynik przeglądu bez kompletu sześciu czynności (min. jedna), niewykonane oznaczone w PDF.
- Wyraźne podpowiedzi blokad zapisu i podpisu.

## Kolejność
1. Migracja `20261031200000_service_visit_partial_checklist_v1404.sql` (właściciel, SQL Editor) i kontrola SELECT.
2. `ready_for_main=true`, CI, scalenie, Vercel 14.04.

Uwaga: nowa aplikacja przed migracją pozwoliłaby kliknąć zapis 2 z 6, a serwer odrzuciłby go starym komunikatem — dlatego migracja najpierw.
