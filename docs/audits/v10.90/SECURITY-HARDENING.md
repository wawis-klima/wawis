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

Wskazane funkcje to triggery/normalizatory i nie są `SECURITY DEFINER`. Ich odwołania do obiektów aplikacji są schema-qualified albo korzystają z wbudowanych funkcji PostgreSQL, dlatego 10.90 przypina `search_path = ''` bez zmiany logiki biznesowej.

## Private tombstone INFO

Dla `private.push_subscription_lifecycle_tombstones` potwierdzono na produkcji read-only:

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

## Realny staging 10.90

Tymczasowy Supabase branch:

- nazwa: `wawis-10-90-security-staging`;
- branch id: `fe7e0006-6e8e-42e3-a3c2-7d12708704cf`;
- project ref: `sailtkxxyvcalcndrpyh`;
- parent produkcyjny: `uohziyaudbpwmupvljyd`;
- koszt przy utworzeniu: `0.01344 USD/h`;
- produkcja nie była modyfikowana.

Automatyczny replay historycznych migracji Supabase nie odtworzył pełnego schematu (po resecie branch miał tylko dwa najstarsze wpisy i brak kluczowych tabel/funkcji). Nie potraktowano takiego stanu jako wiarygodnego stagingu aplikacji.

Ponieważ migracja 10.90 jest wyłącznie hardeningiem `ALTER FUNCTION` + ACL, wykonano na realnym Supabase kontrolowany fixture runtime obejmujący dokładne podpisy funkcji. Dla trzech kluczowych funkcji (`admin_list_deleted_jobs`, `job_file_can_be_deleted`, `storage_object_job_id`) użyto następnie dokładnych definicji odczytanych read-only z produkcji i ponownie zastosowano tę samą migrację 10.90.

### Wynik katalogu po migracji

- `admin_list_deleted_jobs()` — `SECURITY DEFINER`, `search_path=''`, `anon EXECUTE=false`, `authenticated/service_role=true` — PASS;
- `job_file_can_be_deleted(text,text)` — `SECURITY DEFINER`, `search_path=''`, `anon EXECUTE=false`, `authenticated/service_role=true` — PASS;
- `storage_object_job_id(text)` — `SECURITY INVOKER`, `search_path=''` — PASS;
- wszystkie 15 funkcji z lintu mutable search_path — `search_path=''` — PASS.

### Negatywne i dodatnie wywołania ról

- `anon -> admin_list_deleted_jobs()` — `42501 permission denied` — PASS;
- `anon -> job_file_can_be_deleted(...)` — `42501 permission denied` — PASS;
- `authenticated -> admin_list_deleted_jobs()` na dokładnej definicji produkcyjnej — wykonuje się, 0 rekordów fixture — PASS;
- `authenticated -> job_file_can_be_deleted(...)` na dokładnej definicji produkcyjnej — wykonuje się, wynik `false` bez JWT fixture — PASS;
- `authenticated -> storage_object_job_id('00000000-0000-4000-8000-000000000001/test.jpg')` — zwraca `00000000-0000-4000-8000-000000000001` po zmianie na INVOKER — PASS.

### Supabase Security Advisor po migracji

Na stagingu po wyrównaniu ACL helperów do produkcji:

- `anon_security_definer_function_executable` dla zakresu 10.90 — brak — PASS;
- `function_search_path_mutable` dla zakresu 10.90 — brak — PASS;
- pozostały wyłącznie ostrzeżenia `authenticated_security_definer_function_executable` dla świadomie dostępnych RPC/helperów; nie są wyciszane masowym REVOKE.

Remediation reference dla lintu `anon SECURITY DEFINER`: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

Remediation reference dla mutable search_path: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

## Ograniczenia evidence

- To jest realny test runtime PostgreSQL/ACL/Advisor na branchu Supabase, ale nie pełny rebuild całej aplikacyjnej bazy 10.89, ponieważ automatyczny branch replay historycznych migracji nadal nie jest wiarygodny.
- Nie wykonano osobnego HTTP requestu przez PostgREST; uprawnienia ról i realne wywołania funkcji sprawdzono bezpośrednio w PostgreSQL na rzeczywistych rolach `anon`/`authenticated`.
- Nie zmieniono polityk Storage; zweryfikowano funkcję parsera używaną przez Storage jako `SECURITY INVOKER` oraz jej wykonanie dla `authenticated`.
- Pełne CI, E2E i build pozostają obowiązkową końcową bramką release.

## Status

- Repo/local: GREEN dla testu statycznego + mutation controls 4/4.
- Realny Supabase staging — ACL/search_path/actual production function definitions/Advisor: GREEN w zakresie hardeningu 10.90.
- Produkcja zmodyfikowana: **NO**.
- Staging pozostaje aktywny do finalnego domknięcia 10.90, potem musi zostać usunięty.
- 10.90 gotowe do `main`: **NO** do czasu zielonego finalnego `WAWIS PR checks / targeted-checks`.