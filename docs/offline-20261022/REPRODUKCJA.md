# Odtworzenie dowodów lokalnie

Wymagania: Node zgodny z projektem, `npm ci`, działający Docker, Chromium/Playwright. Fixture posiada jawne klucze **wyłącznie lokalnych testów**, nie łączy się z zewnętrznym Supabase. Nazwy kontenerów zaczynają się `wawis-offline-fixture-`. `start.mjs` odtwarza wyłącznie te kontenery i ich testową bazę; nie uruchamia migracji aplikacji.

```bash
docker pull postgres:17-alpine
docker pull postgrest/postgrest:v12.2.12
docker pull supabase/storage-api:v1.80.2
node scripts/offline-fixture/start.mjs
node scripts/offline-fixture/gateway.mjs
```

Gateway pozostaw w osobnym terminalu. Drugi terminal:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test tests/e2e/mobile-durable-outbox.spec.js tests/e2e/mobile-supabase-provider.spec.js tests/e2e/mobile-queue-read-failure.spec.js --workers=1
```

W systemie z przeglądarką zainstalowaną przez Playwright pomiń `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. W zarządzanym środowisku konfiguracja Docker/proxy/CA musi pozostać zgodna z jego instrukcją; skrypty wybierają lokalny socket i nie używają innego Docker context.

Test provider ma jawny skip, gdy fixture nie został uruchomiony. Taki skip oznacza brak dowodu integracji, nawet jeśli inne testy są zielone. Dowód tego zadania wymaga jego rzeczywistego wykonania. Fixture ma prawdziwy Storage, PostgREST, JWT i RLS oraz oryginalną funkcję synchronizacji urządzenia z repozytorium; nie ma GoTrue, produkcyjnych danych, polityk ról ani zewnętrznych dostawców PUSH/AI/e-mail.

Nie uruchamiać dwóch przebiegów Playwright równocześnie w jednym katalogu wyników — mogą nadpisać trace i raport. Do pełnego Closure użyć niezmienionych `release-impact.cjs`, `run-pr-checks.cjs`, `run-pr-playwright.cjs`, `verify-closure-evidence.cjs` na dokładnym SHA i wymaganych grupach. Nie zmniejszać zakresu, nie fabrykować dowodów CI.

Po zakończeniu można zatrzymać gateway i usunąć wyłącznie oznaczone kontenery testowe:

```bash
docker rm -f wawis-offline-fixture-storage wawis-offline-fixture-rest wawis-offline-fixture-pg
docker network rm wawis-offline-fixture-net
```

Nie stosować poleceń czyszczenia baz przeglądarki do telefonów pracowników.
