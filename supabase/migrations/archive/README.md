# Archiwalne migracje SQL

Historyczne pliki SQL z katalogu głównego projektu są traktowane jako archiwum poprzednich etapów i hotfixów.

Dla bieżącej wersji używaj najpierw:

- `supabase/migrations/current/production-upgrade-v8.15.sql`

Pliki historyczne zostają w projekcie ze względu na istniejące smoke testy, dokumentację i możliwość odtworzenia starszych wdrożeń, ale nie powinny być traktowane jako bieżąca sekwencja do uruchamiania bez konkretnego powodu.

## Porządek 14.50 (20.11.2026)

- Wszystkie historyczne pliki SQL z katalogu głównego są tutaj. 41 z nich było identycznymi kopiami — kopie z katalogu
  głównego usunięto. `sms-module-stage-9-log-cleanup.sql` zastąpiono nowszą wersją z katalogu głównego (v12.17).
- Pliki `supabase/setup-*.sql` (moduły paliwa, protokołów, płatności — wersje 9.79–11.58) również są tutaj.
- **Aktywne migracje** to wyłącznie pliki z datą w nazwie w `supabase/migrations/` (np. `20261120180000_…_v1449.sql`).
  Plików z tego katalogu nie uruchamiamy na produkcji bez konkretnego powodu.
