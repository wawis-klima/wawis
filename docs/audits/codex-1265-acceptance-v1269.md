# WAWIS 12.69 — odbiór oryginalnego audytu Codexa 12.65

Źródło: audyt 2026-10-08, `main@31898cfd35d1b119e7a1fc719b93c26b8155a523`, siedem potwierdzonych ustaleń (P0-01; P1-01, P1-02, P1-03, P1-05, P1-06; P2-01).

## Zasada odbioru
Nie wolno zaliczać statycznego grep ani ogólnego green CI w miejsce oryginalnego reproduktora. Każdy wiersz musi odtwarzać mechanizm na prawdziwym kodzie/SQL z atrapami usług; ścieżki dostawcy i produkcja pozostają bez mutacji. Tam, gdzie brak staging/dwóch sesji PostgreSQL/urządzenia, wpisujemy NIEZWERYFIKOWANE.

| ID | Kryterium z raportu Codexa | Trwały test w wydaniu 12.69 | Pozostały dowód |
|---|---|---|---|
| P0-01 | wspólny e-mail + różne NIP; nieprawidłowa tablica GET; **0 PUT/POST**; prawidłowy external_id działa | `scripts/codex-acceptance-fakturownia-v1269.mjs` (kompiluje i wykonuje prawdziwy Edge handler przy atrapach API) oraz `smoke-fakturownia-p0-v1260.mjs` | osobne testowe konto dostawcy; pasywny monitoring produkcji |
| P1-01 | admin tylko JZ → SQLSTATE 23514; poprawna para; legacy; multi-luka JW1/JW3; duplikaty indeksów; brak uprzywilejowanego obejścia | `scripts/smoke-package2-jw-jz-cycle-v1267.mjs` + nowy trigger v1269; wcześniejsze testy protokołu | staging dwóch niezależnych sesji DB: równoczesny zapis modelu i zakończenie; weryfikacja zdjęć/protokołu |
| P1-02 | dwie stare sesje notatki A/B → `JOB_EDIT_CONFLICT`, finalne A, desktop/mobile | `scripts/codex-acceptance-note-sql-v1269.mjs` (SQL) + `smoke-package1-integrity-v1266.mjs` (dwie ścieżki modułów) | UI: zmiana wybranej karty podczas powolnego zapisu; błąd refresh po sukcesie |
| P1-03 | utrata odpowiedzi po commit 100 l → retry nadal 1 ruch i 100 l; reload; inny payload ten sam operation_id; worker zablokowany | `scripts/smoke-package1-integrity-v1266.mjs` (SQL) + `scripts/codex-acceptance-fuel-ui-v1269.mjs` (prawdziwy handler formularza przy utraconej odpowiedzi) | dwie niezależne sesje PostgreSQL z tym samym operation_id; kontrolowane granty starego RPC |
| P1-05 | klient zgłasza nieprzypisanego odbiorcę → 0 Web Push; właściwy odbiorca działa; nieaktywna rola i legacy NULL → brak wysyłki | `scripts/codex-acceptance-push-v1269.mjs` (prawdziwa Edge Function + atrapa Web Push) | test na wydzielonych urządzeniach i zachowanie po równoczesnej zmianie przypisań |
| P1-06 | dwa równoległe wywołania → 1 wysyłka; błąd logu → 0; reassignment ma nowy klucz; dwie subskrypcje niezależne | `scripts/codex-acceptance-push-v1269.mjs` + `scripts/smoke-push-recipient-dedupe-v1268.mjs` (realny SQL w PGlite) | dwie sesje PostgreSQL → jeden zwycięzca; niezależne subskrypcje; receipt dostawcy; monitoring niepewnych prób |
| P2-01 | **oryginalny**, niedziałający test tabliczek musi przejść bez zmiany asercji; boundary 2501 | `scripts/test-desktop-nameplate-overview-authority-v1150.mjs` (naprawiony .order/.range), `scripts/smoke-p2-audit-closure-v1262.mjs` | wszystkie wskazane testy PASS w CI |

## Stan bezpieczeństwa wdrożenia
Wszystkie dane testowe są syntetyczne. Zmiany w tej gałęzi **nie** są wdrażane automatycznie: PR pozostaje draft, `RELEASE-GATE.main_protection.ready_for_main=false`, do czasu pełnej kontroli. Sam rezultat regresji nie jest dowodem rzeczywistego PUSH na iPhonie, dostawy do Fakturowni ani dwusesyjnego konfliktu w pełnym PostgreSQL. 
