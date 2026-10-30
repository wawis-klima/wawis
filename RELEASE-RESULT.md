# RELEASE RESULT — WAWIS 14.00 (gałąź, czeka na decyzję właściciela)

## Zakres
- Serwer blokuje zmiany wizyty w Koszu (triggery + polityka Storage + PUSH); przywracanie i trwałe usuwanie bez zmian.
- Administrator usuwa pomyłkowe zdjęcie przed podpisem (RPC z audytem + Storage API, tylko nieużywany plik zdjęcia).
- Termin, uwagi i obsada wizyty w jednym zapisie.
- `version-bump.cjs` nie kasuje poprzedniego wpisu README; rejestr migracji produkcji uzupełniony o moduł serwisu.

## Numer wersji
- Produkcja: 13.99 (paliwo, PR #452). Gałąź odtworzona na tej wersji; migracja przenumerowana po migracji 13.99.

## Kolejność wdrożenia (po decyzji właściciela)
1. Wykonanie migracji `20261030120000_service_visit_trash_guard_photo_delete_v1399.sql` na produkcji (zgodność MD5 z plikiem, wpis w `PRODUCTION-MIGRATIONS.json`).
2. Scalenie PR do `main` (frontend używa nowego RPC `service_visit_admin_delete_photo`).
3. Vercel READY, `/app-version.json` = 14.00, test na iPhonie.

## Kontrola
- `scripts/service-visit-sql-v1399.sh`: 9 prawdziwych migracji + test zachowania na jednorazowym PostgreSQL 16; RED na schemacie 13.98.
- Do czasu decyzji: `main_protection.ready_for_main=false`.
