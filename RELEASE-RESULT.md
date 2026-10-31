# RELEASE RESULT — WAWIS 14.01

## Zakres
- Naprawa trwałego usuwania serwisu z Kosza: trigger przydziału przepuszcza zaufaną rolę serwerową (`service_role`), której używa `purge-service-visit`. Pracownik i anon nadal odrzuceni.
- Test PostgreSQL z realistyczną rolą serwerową (bez `auth.uid()`); RED odtworzony z komunikatem z produkcji.

## Kolejność
1. Migracja `20261031150000_service_visit_purge_service_role_v1401.sql` na produkcji (niezależna od frontendu, można przed scaleniem).
2. Scalenie, Vercel 14.01, test usuwania wizyty testowej na iPhonie.
