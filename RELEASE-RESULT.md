# RELEASE RESULT

## Wersja
- 11.74

## Zakres
- audyt Kontrahentów: etap 1 / K6
- usuwanie wpisu job-derived w Kontrahentach desktop/mobile korzysta z `admin_delete_jobs_recoverable`
- `p_only_unlinked=true` wymusza po stronie bazy, że fallback może usunąć tylko nadal nieprzypięte montaże
- zwykłe „Usuń kartę” w Montażach również korzysta z recoverable RPC
- przed DELETE nie ma już żadnego `storage.remove(job-photos)`
- lokalna lista `jobs[].photos` nie decyduje już, które pliki mają zostać skasowane
- pliki pozostają w Storage, ponieważ prywatny recycle bin przechowuje snapshot zdjęć i umożliwia kompletne przywrócenie
- bez nowej migracji Supabase i bez zmian RLS

## Produkcyjne potwierdzenie read-only
- `admin_delete_jobs_recoverable(uuid[],boolean)`: istnieje
- trigger `archive_job_before_delete`: aktywny
- policy `retained_job_files_delete`: aktywna
- legacy `job_photos_storage_delete_admin_or_owner`: nie występuje

## Kontrola regresji
- smoke zwykłego usuwania wymaga recoverable RPC i zabrania kasowania Storage
- smoke Kontrahentów wymaga recoverable RPC z `p_only_unlinked=true`
- scenariusz „DELETE nic nie usunął” nie dotyka Storage i kończy się błędem
- wersja/cache PWA: 11.74

## Wynik wydania
- WAWIS PR checks: PENDING
- produkcyjny build: PENDING
- Vercel: PENDING
- merge: PENDING
