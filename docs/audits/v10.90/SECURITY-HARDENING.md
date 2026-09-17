# WAWIS 10.90 — Supabase security hardening

## Zakres

Hardening wynika z produkcyjnego Supabase Security Advisor sprawdzonego po zamknięciu 10.89. Celem jest usunięcie niezamierzonej ekspozycji uprzywilejowanych funkcji bez zmiany funkcjonalnego modelu uprawnień aplikacji.

Produkcja: `uohziyaudbpwmupvljyd` — tylko odczyt podczas przygotowania 10.90.

## Baseline RED / produkcja przed 10.90

Odczyt Advisor z 2026-09-17 wykazał:

- `anon_security_definer_function_executable`: 2 ostrzeżenia:
  - `public.admin_list_deleted_jobs()`
  - `public.job_file_can_be_deleted(text,text)`
- `function_search_path_mutable`: 15 ostrzeżeń;
- `authenticated_security_definer_function_executable`: 33 ostrzeżenia;
- `rls_enabled_no_policy`: 1 INFO dla `private.push_subscription_lifecycle_tombstones`.

Bezpośredni odczyt `pg_proc`/ACL potwierdził, że oba wskazane RPC miały `anon EXECUTE = true`, mimo że repozytoryjny finalny ACL 10.89 deklaruje ich odebranie `PUBLIC/anon` i pozostawienie `authenticated`.

`admin_list_deleted_jobs()` i `job_file_can_be_deleted(text,text)` mają wewnętrzne kontrole autoryzacji, więc baseline nie dowodził wycieku danych; dowodził jednak zbędnej możliwości wejścia anonimowego do `SECURITY DEFINER` przez Data API.

## 33 ostrzeżenia authenticated — klasyfikacja

Nie wykonano masowego `REVOKE authenticated`.

Odczyt definicji produkcyjnych potwierdził, że większość tych funkcji jest świadomym API aplikacji lub helperem RLS i zawiera kontrolę administratora, pracownika, `auth.uid()` albo dostępu do zlecenia. Odebranie `authenticated` w ciemno zepsułoby legalne RPC/polityki.

Wyjątek wybrany do hardeningu:

- `public.storage_object_job_id(text)` — czysty parser UUID ze ścieżki Storage, bez potrzeby uprawnień właściciela; zmiana `SECURITY DEFINER -> SECURITY INVOKER` zachowuje wynik funkcji i usuwa niepotrzebne podniesienie uprawnień.

Pozostałe ostrzeżenia `authenticated SECURITY DEFINER` pozostają do świadomego, funkcja-po-funkcji przeglądu. Nie są automatycznie uznane za podatności tylko na podstawie samego lintu.

## 15 mutable search_path

Wskazane funkcje to triggery/normalizatory i nie są `SECURITY DEFINER`. Ich odwołania do obiektów aplikacji są już schema-qualified albo korzystają z funkcji `pg_catalog`, dlatego 10.90 przypina `search_path = ''` bez zmiany logiki biznesowej.

## Private tombstone INFO

Dla `private.push_subscription_lifecycle_tombstones` potwierdzono:

- `anon` nie ma `USAGE` na schema `private`;
- `authenticated` nie ma `USAGE` na schema `private`;
- `anon` nie ma SELECT/INSERT/UPDATE/DELETE na tabeli;
- `authenticated` nie ma SELECT/INSERT/UPDATE/DELETE na tabeli.

Brak polityki RLS na tej prywatnej tabeli jest więc świadomie zaakceptowany jako INFO; nie dodajemy sztucznej policy tylko w celu wyciszenia lintera.

## Zmiana 10.90

Migracja:

`supabase/migrations/20260917190500_security_hardening_v1090.sql`

Wprowadza:

1. `REVOKE EXECUTE` od `PUBLIC/anon` dla dwóch uprzywilejowanych RPC i jawny `GRANT` dla `authenticated, service_role`.
2. `search_path = ''` dla tych dwóch `SECURITY DEFINER`.
3. `storage_object_job_id(text)` jako `SECURITY INVOKER` z pustym `search_path`.
4. Pusty, przypięty `search_path` dla wszystkich 15 funkcji zgłoszonych przez Advisor.

## Regresja i mutation controls

Test:

`scripts/smoke-supabase-security-hardening-v1090.mjs`

Wynik lokalny po zmianie:

- ACL wymaganych RPC: PASS;
- `storage_object_job_id` invoker: PASS;
- 15/15 search_path: PASS;
- mutation controls: 4/4 wykryte.

Mutation controls celowo przywracają kolejno:

- brak REVOKE dla `admin_list_deleted_jobs`;
- brak REVOKE dla `job_file_can_be_deleted`;
- `storage_object_job_id` jako `SECURITY DEFINER`;
- brak jednego przypięcia `search_path`.

Każda mutacja musi zostać odrzucona przez test.

## Status

- Repo/local: GREEN dla testu statycznego + mutation controls.
- Staging runtime / PostgREST / Storage / Advisor: PENDING.
- Produkcja zmodyfikowana: **NO**.
- 10.90 gotowe do `main`: **NO** do czasu runtime staging i zielonej bramki wydania.
