# WAWIS — Regression Ledger

Ten plik jest trwałym rejestrem potwierdzonych błędów i testów, które mają zapobiegać ich powrotowi.

## Zasada

- Każdy potwierdzony błąd otrzymuje stabilne ID.
- Przed oznaczeniem jako CLOSED musi istnieć wykonywalny test regresyjny odtwarzający mechanizm błędu.
- Test pozostaje w stałych grupach CI również po wdrożeniu poprawki.
- Jeżeli problem wymagał sekwencji zdarzeń, dużego fixture, race condition albo konkretnego stanu UI, reproduktor musi zachować ten warunek.
- Dowód zamknięcia wskazuje konkretny plik testu; samo `assert.match` źródła nie wystarcza dla błędu funkcjonalnego.

## Statusy

- OPEN — błąd potwierdzony, brak kompletnej poprawki/testu.
- FIXED-UNVERIFIED — poprawka istnieje, ale Closure Gate nie potwierdził jeszcze pełnego scenariusza.
- CLOSED — poprawka i trwały test regresyjny przeszły Closure Gate.

## Audyt Codexa — pakiet 3 Closure Gate (12.75), G1/G2 + C13

Potwierdzone przed zmianą:
- Dwa kontrakty `groups=getReleaseGroups('full')` i `pr_groups=selectDomainGroups` dla `critical` mogły być rozbieżne. PR wykonywał `pr_groups`, a pełniejsza lista pojawiała się w klasyfikatorze; nie była twardą gwarancją wykonania.
- Przebieg na PR mógł przechowywać w dowodach `GITHUB_SHA` wskazujące syntetyczny merge GitHub zamiast jawnie potwierdzać konkretny `pull_request.head.sha`. Brak odrębnego porównania źródłowego HEAD.
- Aktywny ruleset GitHub `Wawis` (id 23334033, sprawdzony 2026-10-09) już wymaga `targeted-checks`, PR i strict-status-checks dla domyślnej gałęzi. Zmiana ochrony repozytorium nie jest potrzebna.

Zasady końcowe:
- `groups` = `pr_groups` dla wszystkich profili, bez deklarowania pełnego uruchomienia, gdy CI działa tylko selektywnie.
- Zmiana samej bramki/test runnera/CI wymusza `getReleaseGroups('full')`; wspólne moduły obejmują obie platformy i potrzebne regresje domeny. CSS-only pozostaje ścieżką szybką; optymalizację P2 pomijania SQL/ZIP dla innych zmian odłożono do czasu wiarygodnego porównania pokrycia.
- CI pobiera źródłowy PR HEAD i wymaga jego zgodności z `git rev-parse HEAD` oraz `git_head_sha` dowodów grouped/E2E; `GITHUB_SHA`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT` pozostają weryfikowane.
- Gate i runner osobno rekonstruują zakres z oryginalnego diff i odrzucają podmieniony `impact`.

| ID | Stan | Reprodukcja i trwały test |
|---|---|---|
| CODEX-CLOSURE-G1 | gotowe do CI | `scripts/smoke-closure-integrity-v1275.cjs`: przykłady globalnej zmiany bramki, współdzielonej diagnostyki, specyficznego SMS i CSS, nie można zawęzić `groups/pr_groups`. |
| CODEX-CLOSURE-G2 | gotowe do CI | ten sam skrypt: niezależna kontrola podmienionego `release-impact.json`, obcego grouped/E2E HEAD, podmienionych `effective_files` i `all_passed=false`; niedopuszczenie do runnera. |
| CODEX-CLOSURE-C13 | częściowo / świadomie ograniczone | istniejący profil `fast-ui` zachowany bez Playwright i pełnych SQL. Nie rozluźniono krytycznych testów dla innych zmian bez pomiarów. |
| CODEX-GITHUB-RULESET | stan zweryfikowany odczytem API | `https://github.com/wawis-klima/wawis/rules/23334033` — aktywny `targeted-checks`, PR, strict policy. |

Odbiór wydania wymaga zielonego pełnego CI dla aktualnego HEAD PR, Closure Gate, Playwright mobile/desktop, dwusesyjnego PostgreSQL i build, następnie potwierdzonego merge/Vercel/wersji 12.75. Historyczne dowody nie wystarczają. Bramka nadal nie zastępuje ręcznego sprawdzenia realnych telefonów/PUSH.

## Audyt Codexa 12.72 — P1 diagnostyka, pakiet 2 (12.74)

Zgłoszenia C3/C4 — reprodukcje wymagane przed naprawą (RED) i po naprawie (GREEN):

| ID | Mechanizm / priorytet | Stan po weryfikacji | Test i dowód |
|---|---|---|---|
| CODEX-DIAG-D8 | P1, pracownik dostawał 42501 na INSERT ON CONFLICT mimo INSERT-own + brak SELECT-own | CLOSED dla kontraktu SQL; fizyczny klient PostgREST: EXTERNAL | `scripts/smoke-diagnostic-worker-rls-v1274.mjs` — PGlite rzeczywiste SQL 42501 przed/INSERT+retry po migracji; B/anon odrzuceni, admin ma odczyt. Migracja `20261008200351_diagnostic_worker_upsert_rls_v1274.sql` zastosowana i potwierdzona odczytem produkcyjnego `pg_policies` / `schema_migrations`. |
| CODEX-DIAG-D2 | P1, spóźniony ACK nadpisywał nowy zapis z in-flight | CLOSED dla lokalnego wyścigu | `scripts/smoke-diagnostics-ingest-queue-v1274.mjs` — wykonawcze dodanie w czasie await, ACK per ID, rozdzielenie kont, jeden flush na sesję, idempotentny retry, mobile i desktop. |
| CODEX-DIAG-D5 | P1, 300 info wypierało niewysłany błąd i najnowsze 30 głodziło starsze | CLOSED dla kontraktu kolejki 300 | ten sam test — 350 zdarzeń info po niesynchronizowanym błędzie, zachowany error, limit 300, licznik dropped, 30 najstarszych i kolejna porcja. |
| CODEX-DIAG-RLS-STATE | P1, odmowa 42501 z nazwą tabeli była ukrywana jako 'unavailable' | CLOSED dla mapowania klienta | ten sam test — jawny `errorCode=42501`, status `error`, brak ACK przy odmowie i udany retry. |

Dowód automatyczny: [PR #297](https://github.com/wawis-klima/wawis/pull/297); [wstępny kompletny przebieg CI #37835981482](https://github.com/wawis-klima/wawis/actions/runs/37835981482) — wszystkie regresje, PostgreSQL 2 sesje, Playwright mobile/desktop, Closure Gate i build PASS. Nazwa pliku migracji została później dopasowana do rzeczywistego identyfikatora Supabase; **końcowy przebieg CI dla HEAD PR po tej zmianie nadal musi być GREEN przed merge.**

Kontrola w produkcji: zastosowano migrację z ID 20261008200351. `SELECT` own-only dla pracownika istnieje obok admin-only, `INSERT` own-only pozostaje, brak pracowniczego UPDATE/DELETE. Nie sprawdzono jeszcze realnego żądania PostgREST zalogowanego pracownika; ten punkt pozostaje EXTERNAL, a sama cisza w telemetrii nie będzie przedstawiana jako potwierdzenie poprawnej wysyłki.

Nie zamykamy tym pakietem tematów C5–C13 (Closure Gate, startup, PUSH, widoki i koszty). P0 D1/D3 nadal są w regresjach i muszą przechodzić na każdym releasie.

## Audyt Codexa 12.72 — P0 diagnostyka, pakiet 1 (12.73)

Red (dowody oryginalne Codexa, syntetyczne fixture, bez produkcyjnych danych):
- D1: lokalny Error.message/stack zachowywał nazwisko, adres lub tekst Bearer; brak skutecznej sanitacji również w eksporcie.
- D3: jedna wspólna historia localStorage po logout/login pozwalała odczytać/wysłać wpisy A jako B, a spóźniony ACK mógł nadpisać zapis nowego konta.

Green (wykonywalny reproduktor): `scripts/smoke-diagnostics-p0-privacy-v1273.mjs` w grupie `core` (`scripts/test-groups.cjs`). Wykonuje rzeczywiste oba moduły loggerów i izolacji, testuje sekret/PII w localStorage i raporcie, migrację starego bufora fail-closed, przełączenie konta, logout/login, nieprawidłowego ownera i powrót ACK z poprzedniej sesji. `scripts/smoke-diagnostic-report.cjs` uaktualniono, aby wymagał schematu, nie samego regexu.

Dowód CI: [PR #296](https://github.com/wawis-klima/wawis/pull/296), [WAWIS PR checks run 37832603971](https://github.com/wawis-klima/wawis/actions/runs/37832603971): regresje, PostgreSQL na dwóch sesjach, Playwright mobile/desktop, Closure Gate i build — PASS. Ostateczny merge/deployment musi nadal potwierdzić wersję 12.73.

| ID | Priorytet | Mechanizm | Status | Trwała regresja i warunek |
|---|---|---|---|---|
| CODEX-DIAG-D1 | P0 | Dowolny Error.message/stack, komentarz/adres/token w lokalnym logu i eksporcie | CLOSED | `scripts/smoke-diagnostics-p0-privacy-v1273.mjs`; brak PII/sekretów w localStorage, raporcie i centralnym schemacie |
| CODEX-DIAG-D3 | P0 | Jeden nieprzypisany bufor może mieszać konta po logout/login i przy spóźnionym ACK | CLOSED | ten sam wykonywalny test; A nieczytelny dla B, A nigdy nie raportuje jako B, konta mają właściwą generację sesji |

Pozostałe z audytu Codexa (D2/D5, D8, G1/G2, etapy startu/PUSH) nie są tu zamykane. To osobne pakiety; sukces P0 nie jest dowodem naprawy RLS/upsert, wyścigu ACK między wpisami tego samego konta ani produkcyjnego odbioru PUSH.

## Audyt SMS — zamknięcie 2026-10-06

Dowód wspólny dla poniższych pozycji:
- PR #276, finalny WAWIS PR checks run 755,
- `closure-gate-result.json = GO`,
- profil `critical`, zakres `full`,
- 121/121 komend regresyjnych PASS,
- Playwright mobile PASS,
- Playwright desktop PASS,
- artefakt `wawis-closure-evidence-276-1`,
- dwusesyjny PostgreSQL normal claim: PID 1233461 wygrał, PID 1233462 bez claimu,
- dwusesyjny PostgreSQL retry: PID 1233472 `ok=true`, PID 1233476 `retry_claim_exists`, dokładnie 1 claim retry,
- syntetyczny fixture po teście: 0 claimów / 0 logów / 0 jobs.

| ID | Priorytet | Mechanizm | Status | Trwały reproduktor / dowód |
|---|---|---|---|---|
| SMS-01 | P1 | A error → retry B error → następny retry blokowany jako `group_already_sent` | CLOSED | `scripts/smoke-sms-retry-chain-v1257.mjs` + `scripts/smoke-sms-retry-lifecycle-v1257.mjs`; A→B→C retry przechodzi |
| SMS-02 | P1 | różni kontrahenci ze wspólnym numerem docelowym łączeni przez frontend/licznik | CLOSED | `scripts/smoke-sms-customer-identity-pagination-v1257.mjs` + `scripts/smoke-sms-identity-pagination-v1257.mjs`; 2 contractor_id + 1 numer pozostają 2 klientami |
| SMS-03 | P1 | niepełny odczyt `jobs` przy >1000 rekordów | CLOSED | te same testy identity/pagination; 1201 jobs, zakresy 0–499 / 500–999 / 1000–1499 |
| SMS-04 | P2 | komunikat częściowego delete znikał po silent reload | CLOSED | `scripts/smoke-sms-ui-flow-closure-v1257.mjs` + `scripts/smoke-sms-ui-flow-v1257.mjs`; raport jest ustawiany po refreshu |
| SMS-05 | P2 | historia po wysyłce otwierała się bez świeżego pobrania strony | CLOSED | te same testy UI flow; po mutacji `loadFullHistoryPage(1)` wykonuje się po refreshu |
| SMS-06 | P2 | `jobs.last_sms_status` / `last_sms_log_id` mogły opisywać poprzednią próbę lub zostać przejęte przez stary callback | CLOSED | testy retry lifecycle/chain; nowa próba przejmuje wskaźnik, spóźniony callback starej próby go nie odzyskuje |

## Reguła na przyszłość

Każde kolejne potwierdzone znalezisko dopisujemy do tej tabeli lub kolejnej sekcji domenowej. Status CLOSED nadajemy dopiero po zielonym Closure Gate i zapisanym dowodzie CI. Dla race condition w bazie, gdy jest to możliwe i bezpieczne, wymagany jest dodatkowo dowód z dwóch niezależnych sesji PostgreSQL albo równoważny test rzeczywistej konkurencji.


## Końcowy pakiet 12.58 — zamknięcie P2 z audytu końcowego

| ID | Obszar | Status | Trwały dowód |
|---|---|---|---|
| FINAL-SMS-01 | historia po retry/delete z Niewysłane | CLOSED | `scripts/smoke-sms-history-mutations-v1258.mjs` + wspólny `refreshSmsMutationForVisibleHistory` |
| GATE-01 | niekompletne commands/E2E mogły przejść jako GO | CLOSED | `scripts/smoke-closure-evidence-negative-v1258.cjs`; verifier porównuje dokładny expected command set i E2E runs |
| GATE-02 | fresh rebuild kończył się na 12.56 | CLOSED | manifest zawiera migracje 12.57, `migrationCoverageFrom`, a rebuild-rehearsal failuje przy pominięciu |
| GATE-03 | PENDING regex nie egzekwował polityki | CLOSED | `scripts/smoke-release-policy-negative-v1258.cjs` |
| GATE-04 | timestampy migracji repo != produkcja | CLOSED | repo: 20261006051947/054129/054752/055831; read-only produkcja potwierdzona 1:1; `scripts/verify-supabase-migration-history-v1258.mjs` |

Dowód CI przed ustawieniem READY_FOR_MAIN:
- PR #277, run 774,
- 99/99 komend regresyjnych PASS,
- Playwright mobile PASS,
- Playwright desktop PASS,
- Closure Gate GO,
- production build PASS,
- artifact `wawis-closure-evidence-277-1`.


## SMS 12.59 — zgłoszenia produkcyjne 2026-10-06

| ID | Obszar | Mechanizm | Status | Trwały reproduktor / dowód |
|---|---|---|---|---|
| SMS-07 | usuwanie z głównej kolejki | `row.id` urządzenia/zlecenia trafiał razem z prawdziwym `sms_log.id` do anulowania; prawidłowy log znikał, a drugi identyfikator dawał fałszywy `NOT_FOUND` | CLOSED | `scripts/smoke-sms-delete-identity-v1259.mjs` + PR #278 run 783 / Closure Gate PASS |
| SMS-08 | prezentacja statusu | `pending_approval` miał zbyt długą etykietę „Oczekuje na zatwierdzenie” | CLOSED | `scripts/smoke-sms-delete-identity-v1259.mjs` + `scripts/test-sms-approval-routing.mjs` + PR #278 run 783 / Closure Gate PASS |


## P1 12.61 — integralność montażów, JW/JZ i paliwa

Dowód przed poprawką:
- PR #281, run 798,
- F03: FAIL — po niejednoznacznym błędzie zapisu retry tworzył 2 rekordy zamiast 1,
- F04: FAIL — brak wspólnej walidacji pary JW/JZ bezpośrednio przy zakończeniu,
- F05: FAIL — pełny widok paliwa kończył się na 1000 rekordach,
- F10: PASS — gotówka już wymagała kwoty > 0, a przelew dopuszczał brak kwoty.

Dowód po poprawce:
- run 809: F03/F04/F05/F10 PASS, pełne regresje PASS, Playwright mobile PASS, Playwright desktop PASS, Closure Gate PASS, production build PASS,
- produkcyjna migracja F03: `20261007062745_job_create_idempotency_v1261`,
- potwierdzone pola `jobs.create_operation_id` i `jobs.create_payload_fingerprint`,
- potwierdzony unikalny indeks `jobs_create_operation_id_uidx`,
- constraint `jobs_create_operation_metadata_consistent` ma `validated=true`.

| ID | Priorytet | Mechanizm | Status | Trwały reproduktor / dowód |
|---|---|---|---|---|
| F03 | P1 | utrata odpowiedzi po INSERT mogła spowodować drugi montaż przy ponownym zapisie | CLOSED | `scripts/smoke-p1-data-integrity-v1261.mjs`; stały `create_operation_id` + fingerprint + unikalność w DB |
| F04 | P1 | zakończenie nie ponawiało końcowej kontroli zgodności JW/JZ | CLOSED | `scripts/smoke-p1-data-integrity-v1261.mjs`; wspólna `validateJobDevicesForCompletion` w desktop/mobile |
| F05 | P1 | administracyjny raport paliwa obcinał historię do 1000 rekordów | CLOSED | `scripts/smoke-p1-data-integrity-v1261.mjs` + `smoke-fuel-module-v1014.mjs`; paginacja po 500 |
| F10 | P1 | spójność kwoty i metody płatności | CLOSED | `scripts/smoke-p1-data-integrity-v1261.mjs`; produkcyjny constraint: gotówka > 0, przelew kwota opcjonalna |


## P2 12.62 — domknięcie dzisiejszego audytu Codexa

Dowód przed poprawką:
- PR #282, run 816,
- F06: FAIL — pełne odczyty zdjęć/weryfikacji/job_access nie były stronicowane i mogły zatrzymać się na limicie API,
- F07: FAIL desktop + mobile — UPDATE statusu z wynikiem 0 rekordów był traktowany jak sukces,
- F08: FAIL desktop + mobile — retry usunięcia po utracie odpowiedzi nie miał stabilnego operation_id,
- F09: FAIL — fresh rebuild startował zbyt późno i nie obejmował aktywnych migracji z katalogu current.

Dowód po poprawce:
- run 833: pełne regresje PASS,
- Playwright mobile PASS,
- Playwright desktop PASS,
- Closure Gate PASS,
- production build PASS,
- fresh rebuild przechodzi dwukrotnie i obejmuje aktywne migracje do 12.62,
- produkcyjne migracje P2:
  - `20261007071004_p2_status_delete_idempotency_v1262`,
  - `20261007071856_p2_restore_snapshot_integrity_v1262`.

| ID | Priorytet | Mechanizm | Status | Trwały reproduktor / dowód |
|---|---|---|---|---|
| F06 | P2 | niepaginowane odczyty metadanych mogły pominąć rekordy po przekroczeniu limitu API | CLOSED | `scripts/smoke-p2-audit-closure-v1262.mjs`; desktop photos/nameplate/job_access i mobile job_access korzystają z pełnej paginacji |
| F07 | P2 | zmiana statusu mogła wyglądać na sukces przy 0 zmienionych rekordów lub konflikcie innej sesji | CLOSED | `scripts/smoke-p2-audit-closure-v1262.mjs`; `change_job_status_guarded` zwraca changed/already_applied/conflict/not_found |
| F08 | P2 | utrata odpowiedzi po DELETE mogła spowodować niejednoznaczny retry | CLOSED | `scripts/smoke-p2-audit-closure-v1262.mjs`; stabilny `operation_id` + `admin_delete_job_idempotent` |
| F09 | P2 | fresh rebuild nie obejmował pełnego aktualnego schematu i katalogu `migrations/current` | CLOSED | manifest + `scripts/audit-v1089/rebuild-rehearsal.mjs`; run 833, dwukrotny rebuild PASS |
| P2-RESTORE | P2 | późniejsza migracja restore mogła przyjąć uszkodzony nowy snapshot kosza | CLOSED | koperta integralności `_integrity`, validated constraint i fixture legacy/restore w pełnym rebuildzie |


## 12.64 — mobilne zwijanie szczegółów zbiornika paliwa

Zakres regresji:
- na mobile administrator zawsze widzi duży bieżący stan zbiornika,
- tekst „Liczenie od … · start 5000,00 l” nie zajmuje miejsca na mobile,
- „Wydano do aut”, „Dostawy + start” i „Dodaj dostawę” są dostępne dopiero po rozwinięciu „Szczegóły zbiornika”,
- desktop zachowuje dotychczasowy układ bez tego dodatkowego zwijania.

Trwały reproduktor: `node scripts/smoke-fuel-tank-mobile-collapse-v1264.mjs`.

## 12.63 — licznik zbiornika paliwa

Dowód przed implementacją:
- run 836: FAIL — brak eksportu `addFuelTankDelivery`, czyli licznik/dostawy nie istniały jeszcze w aplikacji.

Dowód po implementacji:
- run 852: pełne regresje PASS,
- Playwright E2E PASS,
- Closure Gate PASS,
- production build PASS,
- fresh rebuild PASS,
- produkcja: stan początkowy 5000,00 l od 2026-10-07 09:57 Europe/Warsaw,
- licznik, historia i dostawy widoczne wyłącznie dla administratora,
- pracownik nie pobiera stanu zbiornika i RLS blokuje SELECT/INSERT ruchów magazynowych poza administratorem.

| Zakres | Status | Dowód |
|---|---|---|
| Stan początkowy 5000 l | CLOSED | `20261007080329_fuel_tank_stock_v1263.sql`; produkcja = 5000,00 l |
| Automatyczne odejmowanie tankowań | CLOSED | trigger `private.sync_fuel_tank_movement()` + FK `fuel_entry_id` ON DELETE CASCADE |
| Korekta/usunięcie tankowania aktualizuje stan | CLOSED | UPSERT ruchu przy UPDATE + CASCADE przy DELETE |
| Dostawy do zbiornika | CLOSED | `admin_add_fuel_tank_movement` |
| Widoczność tylko administrator | CLOSED | UI `isAdmin`, brak pobierania dla pracownika, RLS `fuel_tank_movements_admin_select`, RPC z kontrolą admin |
| Trwała regresja | CLOSED | `scripts/smoke-fuel-tank-stock-v1263.mjs` + run 852 |

## 12.65 — potwierdzenia dostawy PUSH

Zgłoszenie produkcyjne:
- zakończenie montażu zostało poprawnie zapisane,
- Edge Function wysłała `job_completed`,
- dostawca Apple przyjął wiadomość kodem 201,
- brakowało dowodu, czy Service Worker urządzenia odebrał payload i czy `showNotification` zakończył się powodzeniem.

Trwała ochrona:
- `push_delivery_log.received_at` potwierdza odebranie payloadu przez Service Worker,
- `push_delivery_log.displayed_at` potwierdza udane `showNotification`,
- receipt wymaga pary `deliveryLogId` + losowy token; w bazie przechowywany jest tylko SHA-256 tokenu,
- błąd telemetrii nie może blokować wyświetlenia,
- `scripts/smoke-push-delivery-receipts-v1265.mjs` pilnuje kolejności received → filtr bezpieczeństwa → showNotification → displayed.

## Audyt Codexa 12.65 — odbiór po pakietach 1–3 (wydanie 12.69)

Dla każdego ustalenia obowiązuje oryginalny scenariusz z audytu Codexa z 2026-10-08. Zestaw testów jest podłączony do `scripts/test-groups.cjs`. Statusy pozostają **FIXED-UNVERIFIED** do udokumentowania finalnego CI, produkcyjnej zgodności i wskazanych oddzielnie testów staging/dostawcy/dwóch sesji PostgreSQL. Nie wolno interpretować PASS statycznego testu jako dowodu wykonania biznesowej operacji.

| ID | Priorytet | Pierwotny błąd | Status | Reproduktor |
|---|---|---|---|---|
| CODEX-P0-01 | P0 | Wspólny e-mail / różny NIP mógł prowadzić do obcego PUT; zła odpowiedź listy do niechcianego POST | FIXED-UNVERIFIED | `scripts/codex-acceptance-fakturownia-v1269.mjs`, `smoke-fakturownia-p0-v1260.mjs` |
| CODEX-P1-01 | P1 | DB dopuszczał zakończenie montażu bez JW / z wadliwymi JW1/JW3 | FIXED-UNVERIFIED | `scripts/smoke-package2-jw-jz-cycle-v1267.mjs`; SQL guard 12.69 |
| CODEX-P1-02 | P1 | Notatka B nadpisywała A z nieaktualnej karty | FIXED-UNVERIFIED | `scripts/codex-acceptance-note-sql-v1269.mjs`, `smoke-package1-integrity-v1266.mjs` |
| CODEX-P1-03 | P1 | Utrata odpowiedzi przy dostawie 100 l i retry dodawała 200 l; stary RPC nadal pozwala ominąć operation_id | FIXED-UNVERIFIED | `scripts/codex-acceptance-fuel-ui-v1269.mjs`, `scripts/codex-acceptance-fuel-old-rpc-v1269.mjs`, `smoke-package1-integrity-v1266.mjs` |
| CODEX-P1-05 | P1 | Żądanie PUSH z obcym odbiorcą wysyłało przydzielenie | FIXED-UNVERIFIED | `scripts/codex-acceptance-push-v1269.mjs` |
| CODEX-P1-06 | P1 | Dwa równoczesne żądania mogły wysłać podwójny PUSH | FIXED-UNVERIFIED | `scripts/codex-acceptance-push-v1269.mjs`, `smoke-push-recipient-dedupe-v1268.mjs` |
| CODEX-P2-01 | P2 | Oryginalny test tabliczek kończył się na .order/.range | FIXED-UNVERIFIED | `scripts/test-desktop-nameplate-overview-authority-v1150.mjs` (oryginalne asercje) + `smoke-p2-audit-closure-v1262.mjs` (2501) |

Granice dowodu: nie wykonano testu z prawdziwą Fakturownią, rzeczywistego Web Push na telefonach, testu dwóch niezależnych sesji PG ani produkcyjnego ponowienia paliwa. Wszystkie te elementy wymagają osobnego świadomego odbioru. Przyszły status CLOSED musi wskazywać konkretny numer PR, run, artefakt Closure Gate i potwierdzoną wersję produkcyjną.

