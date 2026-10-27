# Historia migracji produkcji WAWIS (tylko do wglądu)

**Nie uruchamiaj tych plików.** To kopia SQL, który już został wykonany na produkcji. Służy do przeglądu
historii i odtworzenia bazy od zera, a nie do wdrażania zmian.

## Stan na 27.10.2026

Produkcja (`uohziyaudbpwmupvljyd`) ma w `supabase_migrations.schema_migrations` **117** migracji
(13.08–20.10.2026). Wykaz z sumami MD5: `supabase/PRODUCTION-MIGRATIONS.json`.

| Status | Liczba | Co to znaczy |
|---|---|---|
| `identical` | 52 | plik w repozytorium ma dokładnie tę treść, którą wykonano na produkcji |
| `similar` | 51 | plik o tej nazwie jest w repozytorium, ale treść różni się od wykonanej (później poprawiany, inny format, inny numer wersji) |
| `exported` | 14 | brakowało w repozytorium — dokładny SQL wyeksportowany do tego katalogu (MD5 zgodne z produkcją) |

Numery wersji plików w `supabase/migrations/` często **nie są** numerami z produkcji (część zmian wdrażano
przez panel/MCP z inną datą). Dlatego **nie używaj `supabase db push`** z tego repozytorium na produkcji —
CLI uznałby część plików za nowe i próbowałby je wykonać ponownie.

## Jak odbudować bazę od zera

Źródłem prawdy jest codzienna kopia zapasowa (`docs/BACKUP-R2.md`):

- pełny zrzut bazy (`public`, `private`, `auth`, `storage`, `supabase_migrations`) — w tym dokładny SQL
  wszystkich 117 migracji w `supabase_migrations.schema_migrations`;
- osobny schemat `public` i `private` jako SQL;
- każdej nocy kopia jest odtwarzana w izolowanym kontenerze i porównywana (liczba wierszy) — to dowód,
  że odbudowa działa.

Środowisko testowe od zera: `supabase/rebuild/README.md` (wyłącznie staging, nigdy produkcja).

## Aktualizacja wykazu

Tylko odczyt produkcji:

```sql
select version, name, md5(array_to_string(statements, E'\n')), length(array_to_string(statements, E'\n'))
from supabase_migrations.schema_migrations order by version;
```

Nowe migracje dodawaj do `supabase/migrations/` z **tym samym numerem wersji**, pod którym trafią na produkcję.
