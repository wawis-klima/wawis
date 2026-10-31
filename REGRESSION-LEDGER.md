# WAWIS — Regression Ledger

## SERVICE-ADMIN-1399 — Kosz po stronie serwera, usuwanie zdjęcia, zapis szczegółów (30.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| SV-1399-TRASH-SERVER | FIXED-UNVERIFIED | RED: na schemacie 13.98 (8 migracji, PostgreSQL 16) administrator zmienił termin i uwagi wizyty w Koszu. Naprawa: triggery `private.service_visit_trash_guard_v1399` / `service_visit_child_trash_guard_v1399`, polityka uploadu, PUSH. Test: `scripts/service-visit-sql-v1399.sh`. |
| SV-1399-PHOTO-DELETE | FIXED-UNVERIFIED | Brak możliwości usunięcia pomyłkowego zdjęcia. RPC + polityka Storage tylko dla nieużywanego pliku aktywnej wizyty; PDF/podpis nie do usunięcia; pracownik odrzucony (42501). Testy SQL i `smoke-service-admin-v1399.mjs`. |
| SV-1399-ATOMIC | FIXED-UNVERIFIED | RED: `saveAssignment` w 13.98 robił dwa osobne UPDATE (termin, potem przydział). Teraz jeden zapis `updateAdminServiceVisitDetails`. |
| SV-1399-BUMP | FIXED-UNVERIFIED | RED: `version-bump.cjs` nadpisywał pierwszy wpis „Ostatnia poprawka” (zniknęły 13.96 i 13.97). Test `smoke-version-bump-readme-v1399.cjs` (RED na starej wersji). |
| SV-1399-LIVE | EXTERNAL | Po decyzji właściciela: migracja na produkcji, iPhone administratora. |
| SV-1400-MENU-FLAKE | FIXED-UNVERIFIED | `release-visual-checks` „pięć pełnych nazw” losowo 12,90 px < 13 px (CI #453 próba 1; próba 2 i PR #452 zielone). Przyczyna: pomiar zaraz po `setViewportSize`. Test czeka na `innerWidth` i dwie klatki; asercje bez zmian. |


## FUEL-LAYOUT-SOURCES-1399 — Tankowania na komputerze i średnie ceny dla Śląska (30.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| FLS-1399-LAYOUT | FIXED-UNVERIFIED | Decyzja właściciela: na komputerze bez „Nowe tankowanie”; 1 Tankowania według samochodu (rozwinięte), 2 Oszczędności, 3 Raport, 4 Wszystkie tankowania (zwinięte). Formularz zostaje w telefonie. E2E desktop-fuel-savings-v1397 (kolejność, zwijanie, klik samochodu rozwija historię); fuel-module-v1014 i update-reload-guard-v1082 — sprawdzenia formularza przeniesione na iPhone (@mobile), bez osłabienia asercji. |
| FLS-1399-SOURCES | FIXED-UNVERIFIED | Cena na stacji: AutoCentrum (tydzień, Śląsk) → zapaliwo.pl (dzień, Śląsk, do 3 dni) → urzędowa. Netto = brutto / (1 + VAT z obwieszczenia / okresu CPN / 23%). smoke-fuel-price-sources na fragmentach prawdziwych stron z 30.10 (AutoCentrum 14 tygodni, zapaliwo 7,98 zł) → 93,21 zł netto. Biuletyn UE odrzucony przez właściciela (tylko co tydzień, kraj). |
| FLS-1399-DB | APPLIED | `supabase/migrations/20261030102441_fuel_market_prices_slaskie.sql` — wykonane na produkcji 30.10.2026 na polecenie właściciela („Wdrażaj 1399”), wersja 20261030102441, MD5 c038d9c5a5a80c2e2bef7112e717d4f4 = plik. Tylko nowa tabela fuel_market_prices (RLS: odczyt administrator) i zadanie pg_cron; istniejące dane bez zmian. Test lokalny PG16 przed wdrożeniem. |
| FLS-1399-EDGE | APPLIED | Funkcja fuel-reference-prices wersja 4 wdrożona 30.10.2026 (verify_jwt false jak dotąd): tryb x-wawis-snapshot (tylko publiczne średnie ceny, limit 1×/dobę zapaliwo, 6 h AutoCentrum), podgląd {"action":"market"}; usunięty próbny odczyt biuletynu UE. Zapis cen urzędowych nadal tylko po sprawdzeniu administratora. |
| FLS-1399-MENU-TEST | OWNER-DECISION | release-visual-checks (iPhone, menu administratora): czcionka 12,7–12,9 px przy 390–430 px nie spełniała progu 13 px; właściciel 30.10 07:24: obecna czcionka ma zostać („taka jest OK”). Próg 12,5 px; sprawdzenia pełnych nazw w jednym rzędzie i braku przewijania bez zmian. Kod menu bez zmian. |
| FLS-1399-LIVE | EXTERNAL | Po poleceniu wdrożenia: administrator na komputerze — układ 1–4, rozwinięcie oszczędności, źródło „AutoCentrum” przy tankowaniach. |

## SERVICE-ADMIN-AUDIT-1398 — audyt modułu serwisowego administratora (30.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| SA-1398-PURGE-TEXT | FIXED-UNVERIFIED | `ServiceAdminPanel.jsx` (13.96) pokazywał pod „Usuń na stałe” tekst o wpisywaniu USUN i drugim potwierdzeniu, sprzeczny z decyzją właściciela; w Koszu widniał też tekst „PDF i zdjęcia pozostają bezpieczne”. Test 13.96 sprawdzał tylko handler, nie tekst. |
| SA-1398-STATUS | FIXED-UNVERIFIED | Statusy `w_trakcie`/`oczekuje_na_podpis` pokazywane jako „Przydzielony”/„bez przydziału”; Kosz pokazywał surowy kod. Jedna funkcja `serviceVisitStatusLabel`. |
| SA-1398-DEVICE-HISTORY | FIXED-UNVERIFIED | Brak historii pojedynczego urządzenia w UI (tylko lista wizyt klienta). `buildServiceDeviceHistory` po `device_ref_id`, data w Europe/Warsaw. |
| SA-1398-VISIT-HISTORY | FIXED-UNVERIFIED | Audyt terminu/statusu/przydziału i log e-mail istniały w bazie, ale nie były widoczne. `loadServiceVisitHistory` (tylko SELECT, błąd źródła raportowany). |
| SA-1398-EMAIL-RETRY | FIXED-UNVERIFIED | Po odmowie dostawcy (422) lub niepewnym wyniku klient ponawiał ten sam `requestKey`, a Edge odpowiadał 409 bez końca; komunikat odsyłał do niewidocznej historii. RED: moduł e-mail z 13.96. |
| SA-1398-TEST | REGRESSION | `scripts/smoke-service-admin-audit-v1398.mjs` — wykonanie modułów: statusy, historia urządzenia (rebuild, strefa czasu, izolacja), historia wizyty (scalenie, częściowy błąd), sekwencje e-mail 422→nowy klucz, 503→ten sam klucz→świadome ponowienie, błąd sieci, 409 bez pending. |
| SA-1398-LIVE | EXTERNAL | Po wdrożeniu administrator sprawdza widoki na fizycznym iPhonie bez kasowania prawdziwych serwisów i bez testowych e-maili do klientów. |
| SA-1398-BACKEND-OPEN | FIXED-UNVERIFIED (14.00, gałąź) | Serwer nie blokuje edycji/zakończenia wizyty w Koszu (RPC `save_item`/`complete`/`cancel`/`wait_for_signature`, kolumnowy UPDATE terminu i przydziału, upload Storage) — tylko UI. Wymaga migracji i zgody właściciela. |


## FUEL-SAVINGS-1397 — oszczędności na własnym zbiorniku (28–30.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| FS-1397-DB | APPLIED | Zgoda właściciela 28.10 11:29. Migracja `20261028103628_fuel_savings_v1389` na produkcji (MD5 bc34520089452a3c4e8742206195cf75 = plik): cena zakupu przy dostawie (brutto + VAT, netto wyliczane), `fuel_reference_prices` (RLS: odczyt tylko administrator, zapis service_role), RPC `admin_add_fuel_tank_movement_v1389`, `admin_set_fuel_purchase_price_v1389`. Nic nie usunięte. Test lokalny PG16: idempotencja, cena tylko przy dostawie, odmowa dla nie-administratora. |
| FS-1397-EDGE | APPLIED | Funkcja `fuel-reference-prices` (verify_jwt=false, zapis po `current_user_is_admin`): obwieszczenia Ministra Energii z API Sejmu (MP), PDF → cena ON netto/brutto. Próba (x-wawis-dry, bez zapisu) na 20 obwieszczeniach: ceny zgodne z gov.pl (7.10 7,80; 10–12.10 8,06; 13.10 8,02; 20.10 7,97). Data z treści dokumentu (API dla poz. 1036 podaje błędnie 23.10 zamiast 26.10). |
| FS-1397-CALC | FIXED-UNVERIFIED | `src/modules/fuel-savings.js`: FIFO po dostawach, cena z dnia tankowania (czas PL), luka > 7 dni = brak, dostawa bez ceny = brak wyniku. smoke-fuel-savings-v1397: dane z produkcji → 107,49 zł netto (29,99 + 42,38 + 35,12). |
| FS-1397-UI | FIXED-UNVERIFIED | Zakładka tylko `displayVehicleOverview` (komputer + administrator), pole ceny dostawy tylko na komputerze. E2E desktop-fuel-savings-v1397 (administrator: 107,49 zł, źródło, tabela; dostawa bez ceny; pracownik iPhone: brak zakładki). codex-acceptance-fuel-ui-v1269 (idempotencja dostawy) — środowisko uzupełnione o pola ceny, asercje bez zmian; odcisk dostawy bez ceny identyczny jak przed 13.97. |
| FS-1397-LIVE | EXTERNAL | Administrator na komputerze: Paliwo → „Oszczędności na własnym zbiorniku” → pierwsze otwarcie pobiera ceny z Monitora Polskiego; kwota ok. 107 zł netto. |

## SERVICE-PURGE-CONFIRM-1396 — pojedyncze potwierdzenie usunięcia serwisu (29.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| SP-1396-REQUEST | FIXED-UNVERIFIED | Właściciel wymaga tylko jednego potwierdzenia, bez wpisywania `USUN` i drugiego pytania; poprzedni handler `ServiceAdminPanel.purgeVisit` wywoływał prompt + confirm. |
| SP-1396-TEST | REGRESSION | `scripts/smoke-service-execution-v1389.mjs`: wykonanie rzeczywistego handlera w VM — cancel bez wywołania backendu, OK jedno wywołanie, brak działania poza Koszem, obsługa błędu; zachowane asercje izolacji SQL/Edge. |
| SP-1396-LIVE | EXTERNAL | Po wdrożeniu administrator potwierdzi dialog na fizycznym iPhonie, bez kasowania prawdziwych danych na potrzeby testu. |


## NAMEPLATE-MSG-1388 — komunikaty tabliczek u administratora (27.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| NM-1388-CAUSE | FIXED-UNVERIFIED | Zrzut właściciela 14:01 (Biała 4a, 2 urządzenia, brak JZ urządzenia 1 — potwierdzone SELECT): zielony „Urządzenia są dodane…” mimo braku tabliczki. Przyczyna: dla admina `isComplete` = są urządzenia (ścieżka ręcznych potwierdzeń 10.90). |
| NM-1388-FIX | FIXED-UNVERIFIED | Zielony komunikat u admina tylko przy `photosComplete`; „Krok 1/3” z listą brakujących tabliczek (serwer, po załadowaniu szczegółów). E2E mobile-admin-nameplate-messages-v1388 (brak JZ / komplet). |
| NM-1388-REGRESSION | REGRESSION | Blokady Protokołu/Zakończenia bez zmian: E2E v1323 admin, v1356, nameplate built E2E. |
| NM-1388-LIVE | EXTERNAL | iPhone (admin): montaż z brakującą tabliczką — tylko czerwony komunikat z nazwą brakującej tabliczki. |

## THUMBS-REBASE-1387 — miniatury znikały po odświeżeniu w tle (27.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| TR-1387-CAUSE | FIXED-UNVERIFIED | Zgłoszenie właściciela 13:09 (iPhone, Biała 4a): miniatury pokazały się i zniknęły. Baza: 10 zdjęć, wszystkie pliki w Storage > 0 B (SELECT). Przyczyna: refreshIncremental (telefon i komputer) zapisywał listę `workingJobs` z początku odświeżania → otwarty w międzyczasie montaż tracił zdjęcia/miniatury załadowane przez reloadJobDetails/hydrateJobThumbnails. |
| TR-1387-FIX | FIXED-UNVERIFIED | `src/modules/incremental-job-changes.js`: zmiany z serwera nakładane na `jobsRef.current` w chwili zapisu. smoke-incremental-rebase-v1387 (odtworzenie wyścigu + kontrola obu useAppSession). |
| TR-1387-REGRESSION | REGRESSION | smoke-audit-races-v1084 (kolejność żądań, kursor), E2E mobile/desktop. |
| TR-1387-LIVE | EXTERNAL | iPhone: otwarcie montażu, w którym pracownik właśnie dodał zdjęcie — miniatury zostają. |

## CLIENT-DATA-1386 — szare przyciski przy niepełnych danych klienta (27.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| CD-1385-LIVE | PASS (właściciel, iPhone, 27.10 11:49) | Blokada działa („Borowa 14” → komunikat „wygląda na adres”). |
| CD-1386-GREY | FIXED-UNVERIFIED | Prośba właściciela: „Zapisz protokół” był jasnoniebieski mimo blokady. Teraz disabled przy clientGateBlocked + wyraźnie szary styl (także „Podpis klienta”). E2E v1385: toBeDisabled + kolor tła. |
| CD-1386-EMAIL | FIXED-UNVERIFIED | „w@qw.pl” przechodziło — część lokalna < 2 znaki = niepełny adres. smoke v1385 + E2E. |
| CD-1386-LIVE | EXTERNAL | iPhone: szare przyciski przy niepełnych danych, aktywne po uzupełnieniu. |

## CLIENT-DATA-1385 — dane klienta w protokole (27.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| CD-1385-GATE | FIXED-UNVERIFIED | Prośba właściciela: wymusić imię i nazwisko (e-mail opcjonalny, ale zalecany). Produkcja: 16/129 bez e-maila, ~10 nazw jak adres/cyfry/jedno słowo. Blokada podpisu i zapisu (online i offline). E2E mobile-protocol-client-data-v1385 (2 scenariusze), smoke-protocol-client-data-v1385. |
| CD-1385-RULES | FIXED-UNVERIFIED | Reguły bez AI: adres/cyfry/jedno słowo/„Pan” → błąd; firma; słownik imion → tylko podpowiedź; e-mail: format, literówki z poprawką, adresy zastępcze, „Klient nie podał e-maila”. |
| CD-1385-SIGN | FIXED-UNVERIFIED | Dane klienta w migawce podpisu (jak dotąd); zmiana po podpisie → nowy podpis. Szkic podpisu offline zawiera clientDraft (tylko pamięć aplikacji). |
| CD-1385-SAVE | FIXED-UNVERIFIED | saveJobClientContact → save_job_concurrent_v1168 (client, title, email z expected) przed płatnością i PDF; trigger v1089 aktualizuje kartę kontrahenta. Bez zmian w bazie. |
| CD-1385-REGRESSION | REGRESSION | Dotychczasowe E2E protokołu (testowi klienci mają poprawne e-maile): mobile-protocol-test, finish-reminder, v1377, v1378, v1295 visual, v1323 admin. |
| CD-1385-LIVE | EXTERNAL | iPhone: protokół w montażu z ulicą zamiast klienta → blokada, uzupełnienie, podpis, zapis; dane widoczne w montażu i u kontrahenta. |

## PUSH-STALE-1384 — wyłączanie martwych subskrypcji PUSH (27.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| PS-1384-RULE | FIXED-UNVERIFIED | Produkcja 27.10: 8 aktywnych subskrypcji, w tym 3 martwe (właściciel 2, K.W. 1); push_delivery_log: 3 wysyłki/zdarzenie u właściciela, 1 odebrana. Reguła 7 dni + nowsze aktywne urządzenie tej samej osoby. Lokalnie PostgreSQL 16 (12 przypadków) i PGlite w CI (smoke-push-stale-cleanup-v1384). |
| PS-1384-SAFE | FIXED-UNVERIFIED | Tylko is_active=false (bez DELETE), minimum 3 dni, jedno urządzenie = zawsze aktywne, „oba stare” = bez zmian; tylko service_role. Klient odtwarza subskrypcję przy is_active=false (replaceExpiredPushSubscription). |
| PS-1384-PROD | FIXED-UNVERIFIED | apply_migration 20261027091451 (MD5 25997c3e… = plik w repo); cron wawis-push-stale-cleanup-v1384 41 2 * * *; podgląd odczytem: dziś 0 do wyłączenia; 8 aktywnych bez zmian. |
| PS-1384-LIVE | EXTERNAL | 30.10 i 31.10: wyłączone dokładnie 3 subskrypcje; właściciel i K.W. nadal dostają powiadomienia. |

## PROD-ERRORS-1383 — poprawki z analizy błędów produkcji (27.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| PE-1383-DETAILS | FIXED-UNVERIFIED | Diagnostyka 13–27.10: NETWORK_REQUEST_ABORTED 362, job.details.retry 212, job.details.failed 1; pg_stat_statements: SELECT photos śr. 0,35–0,39 s, maks. 3,7–3,9 s. Mobile: limity 4500/9000 ms zamiast 3200/3200. E2E mobile (szczegóły, zdjęcia, offline) + smoke 11.12. |
| PE-1383-REFRESH | FIXED-UNVERIFIED | APP_REFRESH_TIMEOUT 51/14 dni (39 z błędem sieci w ±40 s); obsługa już poprawna (partial, bez komunikatu, auto-retry). Teraz console.warn('refreshAll partial') zamiast console.error przy transient+coreJobsApplied (mobile i desktop). |
| PE-1383-DIAG | FIXED-UNVERIFIED | 25 kodów etapów (STAGE_PATTERNS) tylko jako ostatnia reguła; smoke-diagnostics-stage-codes-v1383 (25 przypadków, pierwszeństwo przyczyny, brak PII, istnienie tekstów w kodzie). smoke 12.72: nieznany kod klienta nadal odrzucany (asercja dostosowana: „refreshAll failed” → APP_REFRESH_FAILED). |
| PE-1383-PRIVACY | REGRESSION | smoke-diagnostics-p0-privacy-v1273, ingest-queue-v1274, package4-v1276 — PASS. |
| PE-1383-LIVE | EXTERNAL | Po wdrożeniu: spadek przerwanych pobrań i udział „niesklasyfikowanych” w app_diagnostic_events (kontrola za kilka dni). |

## GATE-1382 — kontrola po wdrożeniu, stabilny WebKit (27.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| GT-1382-POSTDEPLOY | FIXED-UNVERIFIED | postdeploy-check.yml (deployment_status Production / ręcznie): tylko odczyt; wersja, wszystkie pliki precache, SW, Chromium + WebKit. Zgłoszenie postdeploy-failure przy błędzie. Self-test PR: zdrowa budowa OK, brak pliku krytycznego → BŁĄD. Pierwszy przebieg produkcyjny: po wdrożeniu 13.82. |
| GT-1382-WEBKIT-IMAGE | FIXED-UNVERIFIED | webkit-built-e2e w kontenerze mcr.microsoft.com/playwright:v1.60.0-noble (bez apt install-deps, wcześniej do 25 min / przekroczenie limitu). Kontrola zgodności wersji obrazu i package-lock. 18/18 w tym PR. |
| GT-1382-APP | REGRESSION | Kod aplikacji bez zmian poza numerem wersji. |
| GT-1382-REQUIRED | EXTERNAL | Wymagane kontrole w regule main (Settings → Rules): decyzja i zmiana właściciela — instrukcja w raporcie. |

## CLEANUP-1381 — porządki po audycie (27.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| CL-1381-MIGRATIONS | FIXED-UNVERIFIED | Wykaz 117 migracji produkcji (SELECT, MD5): 52 identyczne, 51 różne, 14 brakujących wyeksportowanych z kontrolą MD5 do supabase/production-history (poza supabase/migrations — CLI ich nie wykona). Skan sekretów: brak. smoke-supabase-grants PASS z nowymi plikami. |
| CL-1381-NODE24 | FIXED-UNVERIFIED | checkout@v5, setup-node@v5, upload-artifact@v6 (node24; parametry bez zmian — porównane action.yml). Wszystkie workflowy PR w tym wydaniu; backup-r2 — ręczny przebieg po scaleniu. |
| CL-1381-DOCS | FIXED-UNVERIFIED | CLAUDE.md: hosting tylko Vercel; Cloudflare Pages odłączone; R2 = kopie. |
| CL-1381-APP | REGRESSION | Kod aplikacji bez zmian poza numerem wersji. |
| PH-0B-CLEANUP | OPEN (decyzja) | 6 pustych zdjęć tabliczek w zakończonych montażach: usunięcie blokuje strażnik bazy (zakończony montaż musi mieć zdjęcia tabliczek). 7 pustych plików bez rekordu: usuwanie tylko przez Storage API/panel Supabase. Nic nie usunięto. |

## OPS-1380 — kopia plików po dacie Supabase; testy przypięte do Ubuntu 24.04 (27.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| CI-1380-PIN | FIXED-UNVERIFIED | Ostrzeżenie GitHub: `ubuntu-latest` → Ubuntu 26 od 19.10.2026. Pięć workflowów testowych przypiętych do ubuntu-24.04 (jak backup-r2/backup-selftest). Zgoda właściciela 27.10 06:03. |
| CI-1380-SAME | REGRESSION | Te same zestawy co 13.79: targeted-checks, built-photo-queue-e2e (13), built-nameplate-e2e (8), webkit-built-e2e (18), backup-selftest. |
| CI-1380-APP | REGRESSION | Kod aplikacji bez zmian poza numerem wersji. |
| OPS-1380-SIZEONLY | FIXED-UNVERIFIED | Run 40453176042 (ręczny, main): baza OK, pliki — 3 buckety przerwane po 33 s; logi Supabase: same 200 (HEAD/listowanie), brak pobrań plików. Odtworzone lokalnie: sama zmiana daty + --immutable → „immutable file modified”. rclone copy --size-only; nadpisanie wykrywa --immutable (rozmiar) i cryptcheck (suma). backup-selftest: krok „tylko data”. |
| OPS-1380-DIAG | FIXED-UNVERIFIED | Adnotacja z rodzajem błędu kopii (bez ścieżek plików). |
| OPS-1375-BACKUP | EXTERNAL | Zaplanowany przebieg 27.10 00:20 UTC nie wystartował (brak przebiegu „schedule”). Ręczne uruchomienie z main 27.10 05:03 UTC (run 40453176042). Harmonogram do potwierdzenia następnej nocy. |

## PROTOCOL-SAVE-NOW-1379 — zamknięcie po zapisie offline i „Zapisz teraz” dla protokołu (26.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| PS-1379-CLOSE | FIXED-UNVERIFIED | Prośba właściciela: „Zapisz” offline zamyka okno z ostrzeżeniem, podpis zostaje. E2E v1377, v1378. |
| PS-1379-BAR | FIXED-UNVERIFIED | Pasek „Niezapisany protokół — Zapisz teraz” po powrocie internetu; otwarcie, przywrócenie i zapis jednym dotknięciem. E2E v1377. |
| PS-1379-BASE | FIXED-UNVERIFIED | Szkic pamięta protokół, na którym podpisano; inny protokół na serwerze → bez przywrócenia i bez zapisu (zapobiega nadpisaniu nowszego protokołu). E2E v1378. |
| PS-1379-PREVIEW | FIXED-UNVERIFIED | iPhone: podgląd utknął na „Przygotowuję…” po przywróceniu. Podgląd = podpis do czasu obrotu; odczyt obrazu z limitem 8 s i decode(). |
| PO-1378-LIVE | PASS (właściciel, iPhone, 26.10 17:16) | Protokół offline w montażu otwartym bez internetu; zapis z właściwym podpisem po powrocie internetu. |
| PS-1379-LIVE | EXTERNAL | iPhone: scenariusz z RELEASE-GATE postdeploy. |

## PROTOCOL-OFFLINE-OPEN-1378 — protokół w montażu otwartym bez internetu (26.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| PO-1378-OPEN | FIXED-UNVERIFIED | iPhone 26.10 (13.77, samolot): „Sprawdź” zamiast „Protokół”. Bez internetu protokół bez sprawdzenia rekordu. E2E mobile-protocol-record-unknown-v1378 (Chromium + WebKit). |
| PO-1378-EXISTING | FIXED-UNVERIFIED | Przed zapisem przy nieznanym rekordzie: loadJobProtocolRecord; istniejący protokół → komunikat, podpis zostaje, brak „zapisano” (storeJobProtocol zwróciłby stary rekord). E2E v1378. |
| PO-1378-RECHECK | FIXED-UNVERIFIED | Po online ponowne sprawdzenie protokołu tylko przy zamkniętym oknie (sprawdzenie zamyka okno). |
| PO-1378-REGRESSION | REGRESSION | Online: zapis, korekta, przypomnienie zakończenia, „Sprawdź” przy błędzie serwera — mobile-protocol-test, finish-reminder, v1377. |
| SG-1377-LIVE | FAIL→FIXED (właściciel, iPhone, 26.10 16:46) | Ochrona podpisu niedostępna w montażu otwartym offline — PO-1378-OPEN. |
| PO-1378-LIVE | EXTERNAL | iPhone: scenariusz z RELEASE-GATE postdeploy. |

## SIGNATURE-1377 — ochrona podpisu klienta, poziom 1 (26.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| SG-1377-NOTICE | FIXED-UNVERIFIED | Komunikat bez internetu w trybie edycji protokołu. E2E mobile-protocol-signature-offline-v1377. |
| SG-1377-WAIT | FIXED-UNVERIFIED | Zapis bez internetu nie startuje (bez minuty oczekiwania), ponowienie po zdarzeniu online przy otwartym oknie; zanik zasięgu w trakcie → to samo. E2E v1377. |
| SG-1377-DRAFT | FIXED-UNVERIFIED | Niezapisany podpis w pamięci aplikacji (per konto); przywracany tylko dla identycznej migawki podpisanych danych; czyszczony po zapisie i przy zmianie danych. smoke-protocol-signature-v1377, E2E v1377. |
| SG-1377-ORDER | FIXED-UNVERIFIED | Wykryte w E2E: płatność z serwera (ładowana asynchronicznie) nadpisywała płatność podpisanego szkicu → „Wybierz sposób płatności”. Przywrócenie dopiero po wczytaniu płatności dla tego otwarcia. Wyjątek przy niepełnej płatności nie może przerwać okna (wcześniej: pusty ekran). |
| SG-1377-NOSTORAGE | REGRESSION | Podpis nie trafia do IndexedDB/localStorage (poziom 2 = decyzja właściciela). smoke v1377. |
| SG-1377-PROTOCOL | REGRESSION | Zapis protokołu online, korekta adresu z zachowanym podpisem, przypomnienie zakończenia — mobile-protocol-test, mobile-protocol-finish-reminder, smoke-protocol-signature-reuse. |
| PC-1376-LIVE | PASS (właściciel, iPhone, 26.10 13:54) | Tryb samolotowy: Diagnostyka i montaże otwierają się (13.76). |
| SG-1377-LIVE | EXTERNAL | iPhone: scenariusz z RELEASE-GATE postdeploy (także test aktualizacji 13.76 → 13.77). |

## PRECACHE-1376 — pełne pobranie wersji i bazy bez numeru (26.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| PC-1376-FULL | FIXED-UNVERIFIED | Instalacja SW pobiera wszystkie pliki krytyczne z precache-manifest.json. E2E mobile-precache-offline-v1376 (context.setOffline: reload + pierwsze otwarcie Tabliczek), smoke-sw-precache-v1376 pkt 1. |
| PC-1376-ATOMIC | FIXED-UNVERIFIED | Brak pliku krytycznego → instalacja odrzucona, bez skipWaiting; stara wersja aktywna. smoke pkt 2; obrazek opcjonalny nie blokuje (pkt 3); brak listy → zachowanie sprzed 13.76 (pkt 4). |
| PC-1376-PREVIOUS | FIXED-UNVERIFIED | activate: bieżący + 1 poprzedni wawis-app-shell; cache czytników tabliczek nietknięty. smoke pkt 5, smoke-nameplate-offline-readers-v1370. |
| PC-1376-IDB | FIXED-UNVERIFIED | wawis-mobile-offline-data / wawis-app-read-cache otwierane bez numeru; baza v7/v5 → komentarz offline OK, wersja nieobniżona. E2E mobile-indexeddb-newer-version-v1376 (Chromium + WebKit). LOCAL-DATA-COMPAT: minimalna wersja powrotu nadal 13.62. |
| PC-1376-REGRESSION | REGRESSION | Komentarze/statusy offline, kolejka zdjęć, czytniki offline, szkice urządzeń — built E2E (Chromium, WebKit). |
| PC-1376-VARY | FIXED-UNVERIFIED | Start bez sieci 2/6: /assets/index-*.js ERR_FAILED mimo pliku w cache — caches.match respektował Vary (plik z instalacji bez Origin vs zapytanie modułu z Origin). caches.match(..., { ignoreVary: true }). Diag ×10 bez ponowień: 10/10. smoke-sw-precache-v1376. |
| PC-1376-WHITESCREEN | FIXED-UNVERIFIED | iPhone 26.10 (13.75, samolot): Diagnostyka → biały ekran (nieudany import leniwego ekranu bez obsługi). lazySafe dla wszystkich leniwych ekranów (mobile i desktop): komunikat zamiast białego ekranu. E2E mobile-lazy-screen-fallback-v1376 (Chromium + WebKit), mobile-precache-offline-v1376 (Diagnostyka offline). |
| PC-1376-RETRIES | FIXED-UNVERIFIED | Decyzja właściciela: retries: CI ? 1 : 0 we wszystkich konfiguracjach Playwright; weryfikator built E2E pokazuje ostrzeżenie „niestabilny” dla testów zaliczonych po ponowieniu. Dwa niepowodzenia = NO-GO. |
| PC-1376-LIVE | EXTERNAL | iPhone na dwóch kolejnych wersjach: aktualizacja z internetem → tryb samolotowy → wszystkie ekrany. Chromium nie dowodzi zachowania SW w Safari. |

## OPS-1375 — kopia zapasowa, testy WebKit, procedura wycofania (26.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| OPS-1375-BACKUP | FIXED-UNVERIFIED | Próbna kopia z produkcji 26.10 (run 40296863931): baza + pliki + odtworzenie OK. backup-selftest (przyrost, usunięcie, nadpisanie, szyfrowanie, uszkodzona kopia). Codzienny przebieg z main — do potwierdzenia jutro. |
| OPS-1375-WEBKIT | FIXED-UNVERIFIED | webkit-built-e2e 14/14 (PR #420). Poza WebKit: offline-readers (emulacja offline omija SW), ai-saving (Code 128 z SVG) — Chromium i iPhone. |
| OPS-1375-ROLLBACK | FIXED-UNVERIFIED | prepare-restore-release.cjs: próby na sucho 13.67 = GO, 13.61 = NO-GO. LOCAL-DATA-COMPAT uzupełnione o localStorage 13.71/13.73. |
| OPS-1375-APP | REGRESSION | Kod aplikacji bez zmian — built E2E Chromium i targeted-checks. |
| NR-1374-LIVE | EXTERNAL | Komentarz pracownika bez alertu po 13.74. |

## NOTIF-RLS-1374 — fałszywy błąd przy komentarzu (26.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| NR-1374-RETURNING | FIXED-UNVERIFIED | INSERT … RETURNING do notifications dla innego użytkownika łamał politykę SELECT notifications_read_own (odtworzone na lokalnym PostgreSQL 16). Insert bez odczytu zwrotnego. smoke-notifications-rls-v1374. |
| NR-1374-DUPLICATE | FIXED-UNVERIFIED | Błąd powiadomienia po zapisanym komentarzu nie jest rzucany (mobile i desktop) — koniec ponownego dodawania tego samego komentarza. smoke v1374. |
| NR-1374-POLICY | REGRESSION | Bez zmian w RLS, schemacie i funkcjach bazy. |
| NR-1374-LIVE | EXTERNAL | Komentarz pracownika na iPhonie bez alertu; SELECT: nowy wiersz notifications. |

## AI-SAVING-1373 — AI tabliczek tylko gdy czytnik nie wystarczył (26.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| AS-1373-BARCODE | FIXED-UNVERIFIED | SN z Code 128 (nie EAN, bez konfliktu z nadrukiem) → bez AI. E2E mobile-nameplate-ai-saving-v1373 (0 wywołań), smoke v1373 pkt 1–2. |
| AS-1373-REVIEW | REGRESSION | Potwierdzenie „znak po znaku” nadal wymagane dla single_source; konflikt i brak SN nadal idą do AI; EAN nigdy jako SN. smoke v1369, v1373, E2E robustness. |
| AS-1373-MANUAL | FIXED-UNVERIFIED | „Sprawdź przez AI” → dokładnie 1 wywołanie; ukryty bez internetu i po próbie AI. E2E v1373. |
| AS-1373-CACHE | FIXED-UNVERIFIED | Ten sam kadr (SHA-256) nie płaci drugi raz; pamięć 30 zdjęć do zamknięcia aplikacji. smoke v1373 pkt 4. |
| AS-1373-COUNTER | FIXED-UNVERIFIED | Diagnostyka: licznik AI / pominięć / pamięci (ten telefon, 31 dni). smoke v1373 pkt 3. |
| SN-1372-LIVE | PASS (właściciel, iPhone, 26.10 08:58) | „Zapisz teraz” działa. |
| AS-1373-LIVE | EXTERNAL | iPhone po wdrożeniu: scenariusz z RELEASE-GATE postdeploy. |

## SAVE-NOW-1372 — „Zapisz teraz” po powrocie internetu (26.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| SN-1372-BAR | FIXED-UNVERIFIED | Pasek na liście montaży tylko online i tylko dla montaży ze szkicem; jedno dotknięcie zapisuje. E2E mobile-device-draft-save-now-v1372. |
| SN-1372-SAMEPATH | REGRESSION | Ten sam handleSubmit/saveEditedJob co ręczny zapis — potwierdzenie SN, ostrzeżenia par modeli i konflikty bez zmian. smoke-device-drafts-v1371 (pkt 8), E2E v1363, v1371. |
| SN-1372-NOAUTO | REGRESSION | Bez dotknięcia nic nie zapisuje się samo (decyzja właściciela: pasek, nie pełna automatyka). |
| DD-1371-LIVE | PASS (właściciel, iPhone, 26.10 08:26) | Bez internetu → Zamknij okno → internet → Tabliczki → przywrócone → zapis OK. |
| SN-1372-LIVE | EXTERNAL | iPhone po wdrożeniu: scenariusz z RELEASE-GATE postdeploy. |

## DEVICE-DRAFT-1371 — niezapisane urządzenia po teście iPhone (26.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| DD-1371-REOPEN | FIXED-UNVERIFIED | Administrator: wejście → wyjście bez zapisu → wejście kasowało szkic (takeDeviceFormDraft usuwał przy odczycie). Odczyt bez usuwania; E2E mobile-device-draft-persistence-v1371 krok 2. |
| DD-1371-APPCLOSE | FIXED-UNVERIFIED | Pracownik: zamknięcie aplikacji kasowało szkic z pamięci. Tekst urządzeń w localStorage (bez zdjęć i danych klienta, per konto, 14 dni). E2E krok 3 (reload), smoke-device-drafts-v1371. |
| DD-1371-DISCARD | FIXED-UNVERIFIED | „Odrzuć niezapisane dane” i udany zapis usuwają szkic z pamięci i z telefonu. E2E krok 4, mobile-offline-nameplates-all-roles. |
| DD-1371-DUPSN | FIXED-UNVERIFIED | Błąd 23505 devices_serial_number_key: ten sam wiersz numerów dwa razy w jednym montażu (logi Postgres 26.10). Kontrola przed zapisem + nowy komunikat. smoke-device-drafts-v1371, smoke-empty-device-serial-hotfix. |
| DD-1371-1370 | EXTERNAL | Test 26.10 (13.70): komunikat offline dla zdjęć OK, komentarz offline zsynchronizowany OK, przywrócenie szkicu bez zamykania aplikacji OK. |
| DD-1371-LIVE | EXTERNAL | iPhone po wdrożeniu: scenariusz z RELEASE-GATE postdeploy. |

## OFFLINE-READERS-1370 — czytniki tabliczek zapisane w telefonie (25.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| OR-1370-CACHE | FIXED-UNVERIFIED | iPhone 13.69 offline: SN pusty, bo Code 128 (jsDelivr) i OCR (/ocr/*) ładowane z sieci. Trwały cache service workera + pobranie w tle. E2E mobile-nameplate-offline-readers-v1370 (context.setOffline: pliki z cache, SN wpisany). |
| OR-1370-WORKER | FIXED-UNVERIFIED | Worker OCR z /ocr/worker.min.js (workerBlobURL=false), żeby jego pobrania obsługiwał service worker. Przygotowanie w tle nie zamyka workera używanego przez prawdziwy odczyt. |
| OR-1370-SHELL | REGRESSION | Cache aplikacji wawis-app-shell-v* czyszczony jak dotąd; nowy cache czytników nie jest usuwany przy aktualizacji. E2E photo-queue-built, robustness. |
| OR-1370-LIVE | EXTERNAL | iPhone: Diagnostyka pokazuje oba czytniki „zapisany w telefonie”; tryb samolotowy → SN wpisany. Chromium nie dowodzi obsługi workerów przez SW w Safari. |

## OFFLINE-NAMEPLATE-READ-1369 — odczyt tabliczki bez internetu (25.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| ONR-1369-PREFILL | FIXED-UNVERIFIED | Bez internetu (AI niedostępne) pola modelu i SN dostają odczyt czytnika telefonu zamiast zostawać puste; obowiązkowe „Sprawdziłem numer SN znak po znaku”. smoke-nameplate-offline-reader-v1369, E2E mobile-nameplate-robustness (test offline). |
| ONR-1369-EAN | REGRESSION | EAN ani stary numer urządzenia nigdy nie trafiają do SN; zasłonięty SN online zostaje pusty. smoke v1369 (przypadki 5–6), E2E „nieczytelny SN…”. |
| ONR-1369-NOAI | FIXED-UNVERIFIED | Bez internetu brak wywołania AI i brak 60 s oczekiwania. E2E: aiRequests = 0. |
| ONR-1369-LIVE | EXTERNAL | iPhone: tryb samolotowy → Tabliczki → zdjęcie → pola wypełnione z ostrzeżeniem. |

## ONLINE-ONLY-PHOTOS-1366 — zdjęcia tylko z internetem (decyzja właściciela 25.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| OP-1366-OFFLINE | FIXED-UNVERIFIED | Bez internetu zdjęcia i tabliczki nie są zapisywane w aplikacji; komunikat zamiast lokalnej kolejki. Harness S01, S05, S25 (RED na 13.65); E2E mobile-resilience, mobile-offline-nameplates-all-roles (admin i pracownik). |
| OP-1366-RETRY | FIXED-UNVERIFIED | Wysyłka z pamięci z 3 próbami przy chwilowym zaniku zasięgu / 400 / 503. Harness S08, S09 (RED na 13.65). |
| OP-1366-LEGACY | REGRESSION | Stare zdjęcia z kolejki telefonu: wysyłka, wstrzymanie v4, usuwanie, naprawa — S02–S04, S11–S13, S17, S19, S21–S24, mobile-photo-queue-repair, legacy-hold. |
| OP-1366-LIVE | EXTERNAL | iPhone: tryb samolotowy → komunikat; online → zdjęcie na serwerze. |

## IOS-BLOB-1365 — zawieszony odczyt zdjęcia z kolejki na iPhonie (25.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| IB-1365-BYTES | FIXED-UNVERIFIED | Zdjęcia w kolejce zapisywane jako ArrayBuffer zamiast Blob/File (Safari gubi zawartość). Test S23 (RED 13.64 → GREEN 13.65). |
| IB-1365-HANG | FIXED-UNVERIFIED | 13.64: odczyt nieczytelnego pliku nie kończył się → „Wysyłane” bez żadnej próby wysyłki. Limit czasu odczytu 15 s i kompresji 20 s → jasny błąd. Test S24 (RED 13.64: zawieszenie >45 s → GREEN 13.65). |
| IB-1365-ADMIN | FIXED-UNVERIFIED | Centrum synchronizacji było ukryte dla administratora (`!isAdmin`). Teraz widoczne + „Synchronizuj teraz” w Diagnostyce. CI E2E mobile. |
| IB-1365-LIVE | EXTERNAL | iPhone administratora po wdrożeniu. Chromium nie odtwarza utraty Blob w WebKit. |

## IOS-ZERO-BYTE-1364 — puste uploady zdjęć z kolejki na iPhonie (25.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| ZB-1364-BYTES | FIXED-UNVERIFIED | Safari wysyłał File/Blob z IndexedDB jako żądanie 0 B (logi 25.10 06:57–06:58 UTC, HTTP 400). Teraz storage.upload dostaje ArrayBuffer odczytany przed wysyłką. Test S20 (RED 13.63 → GREEN 13.64). |
| ZB-1364-EMPTY | FIXED-UNVERIFIED | Pusty/nieczytelny plik w telefonie → status błędu „Zrób zdjęcie ponownie”, bez żądania do serwera i bez nieskończonych ponowień. Test S21 (RED 13.63 → GREEN 13.64). |
| ZB-1364-SYNC | FIXED-UNVERIFIED | Zawieszone „Wysyłane” (ważna blokada) nie dało się wymusić — „Wyślij wszystkie” pomijało takie zdjęcia. „Synchronizuj teraz” zwalnia nieużywaną blokadę i wysyła. Test S22 (RED 13.63 → GREEN 13.64), mobile-resilience. |
| ZB-1364-LIVE | EXTERNAL | iPhone administratora: logi Storage 200 z niezerowym rozmiarem, SELECT bytes > 0. Chromium nie odtwarza błędu WebKit. |

## OFFLINE-ADMIN-1363 — tabliczki offline na koncie administratora (25.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| OA-1363-SAVE | FIXED-UNVERIFIED | Administrator offline w „Urządzenia” dostawał „Pełna edycja montażu wymaga połączenia z internetem” (warunek `!isAdmin && serialOnlyMode`). Teraz zapis w telefonie dla każdej roli. Test mobile-offline-nameplates-all-roles-v1363. |
| OA-1363-SYNC | FIXED-UNVERIFIED | performOfflineJobSync pomijał administratora — zmiany offline admina nigdy by się nie wysłały. Teraz synchronizacja po powrocie internetu. Ten sam test (operacja znika z kolejki). |
| OA-1363-WORKER | REGRESSION | Pracownik: bez zmian, ten sam test. |
| OA-1363-LIVE | EXTERNAL | iPhone administratora po wdrożeniu. |

## PHOTOS-1362 — kolejka zdjęć IndexedDB v4 po rollbacku (24.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| PH-1362-V4 | FIXED-UNVERIFIED | 13.61 otwierało wawis-mobile-photo-queue w v3; telefony po 13.42–13.48 mają v4 → VersionError: brak zapisu, brak POST do Storage, nameplate.save.verify.timeout (Paweł 23.10), zdjęcia Kacpra nie wysłane. 13.62 otwiera bez wersji, nigdy nie obniża. Test S03/S15/S16. |
| PH-1362-FUTURE | FIXED-UNVERIFIED | Baza w wersji wyższej niż 4 działa bez obniżania. Test S04/S12. |
| PH-1362-FALSE-SAVED | FIXED-UNVERIFIED | „Zapisano na telefonie” tylko po commit transakcji; brak miejsca offline → okno otwarte z przyczyną, online → wysyłka z pamięci. Test S05/S06/S10. |
| PH-1362-BLOCKED | FIXED-UNVERIFIED | Zablokowana baza: limit czasu, kod PHOTO_QUEUE_BLOCKED, brak fałszywej pustej kolejki. Test S07. |
| PH-1362-REPAIR | FIXED-UNVERIFIED | „Napraw kolejkę zdjęć”: dwa potwierdzenia, usuwa wyłącznie wawis-mobile-photo-queue, sukces tylko po ponownym odczycie pustej kolejki; blokada → brak deklaracji sukcesu. Test S11–S13 + mobile-photo-queue-repair-v1362. |
| PH-1362-HOLD | FIXED-UNVERIFIED | Pierwsza wersja 13.62 (815beb8) po starcie online automatycznie wysyłała stare zdjęcia z bazy v4 zanim użytkownik mógł je usunąć (RED S03/S17/S19 na 815beb8). Teraz wstrzymane do decyzji. Test S03/S17/S19 + mobile-photo-queue-legacy-hold-v1362 (dev i build). |
| PH-1362-ROLLBACK | FIXED-UNVERIFIED | 815beb8 podnosiło v3 do v4 — powrót do 13.61 dawałby VersionError na wszystkich telefonach (RED S18). Teraz v3 pozostaje v3, nowe instalacje v3. Test S18. |
| PH-1362-RETRY | REGRESSION | Utrata internetu, 400/503, awaryjna wysyłka 13.55. Test S08/S09/S14. |
| PH-1362-IOS0B | OPEN | HTTP 400 „No content provided” (multipart 0 B) z iOS także w 13.61; ponowienia kończą się 200. Diagnoza: docs/iphone-test-v1362.md, poza zakresem 13.62. |
| PH-1362-LIVE | EXTERNAL | Fizyczny iPhone z bazą v4 (Safari i PWA): plik w Storage > 0 B i rekord photos potwierdzone SELECT. |

## PROTOCOL-FINISH-1357 — przypomnienie na mobilnym Administratorze (23.10.2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| PF-1357-ADMIN | FIXED-UNVERIFIED | W 13.56 warunek !isAdmin ukrywał okno. W 13.57 usunięto go z onSaved, onClose i widoczności ConfirmActionModal. |
| PF-1357-SIGN | FIXED-UNVERIFIED | Po zapisaniu protokołu i zamknięciu okna status W trakcie oraz jednorazowe przypomnienie także na koncie Administrator. Test Playwright. |
| PF-1357-NO | FIXED-UNVERIFIED | Administrator „Jeszcze nie”: montaż pozostaje W trakcie, poprzedni protokół otwarty ponownie nie pokazuje przypomnienia. Test Playwright. |
| PF-1357-YES | FIXED-UNVERIFIED | Administrator „Zakończ montaż” korzysta z istniejącego updateStatus oraz walidacji urządzeń, protokołu i DB. Test Playwright. |
| PF-1357-STAFF | REGRESSION | Istniejące scenariusze pracownika z 13.56 pozostają w pakiecie testów. |
| PF-1357-LIVE | EXTERNAL | Na produkcji zweryfikować wersję 13.57, nowo zapisany PDF, oba przyciski i zachowanie statusu. |


## PROTOCOL-FINISH-1356 — przypomnienie po podpisaniu (23 października 2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| PF-1356-SAVE | FIXED-UNVERIFIED | Tylko udany zapis PDF z prawidłowym signed_at/storage_path/file_size_bytes uzbraja przypomnienie. |
| PF-1356-NO | FIXED-UNVERIFIED | „Jeszcze nie” pozostawia status W trakcie, test Playwright worker. |
| PF-1356-YES | FIXED-UNVERIFIED | „Zakończ montaż” uruchamia istniejącą updateStatus, bez pominięcia DB/RLS i sprawdzenia tabliczek, test Playwright worker. |
| PF-1356-ONCE | FIXED-UNVERIFIED | Jednorazowo przy zamknięciu nowego protokołu; bez popupu po otwarciu starego PDF, anulowanym zapisie i przełączeniu montażu. |
| PF-1356-REG | EXTERNAL | W produkcji sprawdzić podpis pracownika w trwającym montażu; „Jeszcze nie” i „Zakończ montaż”. |


## NAMEPLATES-1355 — opóźniona odpowiedź iPhone/LTE (23 października 2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| NP-1355-VERIFY | FIXED-UNVERIFIED | WAWIS ponawia odczyt tej samej tożsamości zdjęcia po 8s timeout; test symulujący opóźnienie pierwszej próby i sukces drugiej. |
| NP-1355-QUEUE | FIXED-UNVERIFIED | Wznawianie używa pierwotnego upload_key i storage_path, bez reuploadu zdjęcia z obecnej listy sukcesów. Testy smoke-mobile-photo-idempotency oraz smoke-mobile-nameplate-save-resilience. |
| NP-1355-OFFLINE | FIXED-UNVERIFIED | Brak serwera nie oznacza potwierdzenia i nie zamyka formularza; zdjęcia pozostają w IndexedDB. Test offline i AbortError. |
| NP-1355-SAFETY | FIXED-UNVERIFIED | Protokół i Zakończ nadal wymagają potwierdzonych kompletnych JW/JZ. Bez zmian faktur i backendu. |
| NP-1355-LIVE | EXTERNAL | Po wdrożeniu sprawdzić 13.55 na iPhonie z kontrolowanym przejściem online/offline, dodać komplet JW/JZ bez duplikatów, wykonać protokół. |


## FAKTUROWNIA-1353 — identyfikacja wystawionej faktury po ID (23 października 2026)

| ID | Stan przed CI | Dowód i zabezpieczenia |
|---|---|---|
| FAK-1353-ID | FIXED-UNVERIFIED | Dokładny GET /invoices/:id.json z ID podanym przez administratora, a nie zawodny filtr numeru. |
| FAK-1353-SECURITY | FIXED-UNVERIFIED | Serwerowa kontrola aktywnego administratora, NIP, client_id z prepare, OID, VAT/status, oraz chronione RPC przypisania i globalna unikatowość. |
| FAK-1353-NOWRITES | FIXED-UNVERIFIED | Test funkcji: wyszukiwanie wyłącznie przez GET bez POST/PUT do Fakturowni. |
| FAK-1353-LIVE | EXTERNAL | Na WAWIS 13.53 wpisz ID:584755572 w montażu MADEX i zweryfikuj status oraz numer. |


## PROTOCOL-1352 — przesunięta pierwsza kreska po obrocie iPhone'a (23 października 2026)

| ID | Stan przed CI | Reproduktor / zabezpieczenia |
|---|---|---|
| PROTOCOL-1352-FIRST-INK | FIXED-UNVERIFIED | Playwright: otwarcie podpisu, zmiana szerokości canvas, powrót, pierwsza kreska 13px od lewej i odczyt minX bez użycia Wyczyść podpis. |
| PROTOCOL-1352-RESIZE-KEEP | FIXED-UNVERIFIED | Playwright: kolejna zmiana wielkości canvas nie kasuje już narysowanej kreski. |
| PROTOCOL-1352-SMOKE | FIXED-UNVERIFIED | Smoke CSS+JS sprawdza zgodność bitmapy z rect, ResizeObserver i obsługę pierwszego dotknięcia; zachowane czyszczenie i proporcje. |
| PROTOCOL-1352-IPHONETOUCH | EXTERNAL | Test rzeczywistego iPhone Safari/PWA: po obrocie pierwsza kreska zaczyna się z lewej strony bez czyszczenia, podpis poprawny w PDF. |


## PROTOCOL-1351 — za duże przyciski w poziomym ekranie podpisu iPhone (23 października 2026)

| ID | Stan przed CI | Reproduktor / zabezpieczenia |
|---|---|---|
| PROTOCOL-1351-LANDSCAPE | FIXED-UNVERIFIED | Playwright w `tests/e2e/mobile-protocol-test.spec.js`: 844×390 i 667×375, zmniejszone przyciski 44 px, pełna widoczność i większa przestrzeń na podpis. |
| PROTOCOL-1351-PORTRAIT | FIXED-UNVERIFIED | Playwright: w pionie 390×844 przyciski zachowują oryginalną wysokość minimum 52 px; CSS kompaktowy aktywuje się tylko w poziomie i na dotykowym ekranie. |
| PROTOCOL-1351-SMOKE | FIXED-UNVERIFIED | `scripts/smoke-mobile-protocol-layout-v984.cjs`: stała ochrona selektorów CSS i minimalnej powierzchni przycisków. |
| PROTOCOL-1351-IPHONE | EXTERNAL | Ostateczna kontrola dotykowa przez użytkownika w prawdziwym Safari na iPhonie, po wdrożeniu. |


## PROTOCOL-1350 — podpis w pionie po obrocie iPhone'a (23 października 2026)

| ID | Stan przed CI | Reproduktor / zabezpieczenia |
|---|---|---|
| PROTOCOL-1350-PORTRAIT | FIXED-UNVERIFIED | `scripts/smoke-protocol-signature-orientation-v1350.mjs`: obraz pionowy jest obracany tylko w PDF, prawidłowy poziomy bez zmian. |
| PROTOCOL-1350-MANUAL | FIXED-UNVERIFIED | Test obrotu 0/90/180/270; podgląd i ręczny wybór. |
| PROTOCOL-1350-ORIGINAL | FIXED-UNVERIFIED | Test zapisuje do Storage wyłącznie oryginalne `signatureDataUrl`, nie bitmapę po obrocie; historia i reuse pozostają. |
| PROTOCOL-1350-LIVE | EXTERNAL | Fizyczny iPhone i podgląd PDF, w tym montaż pana Sokołowskiego po zatwierdzeniu poprawionego pliku przez administratora. |

## MOBILE-1328 — AI po rozbieżności SN (19 października 2026)

| ID | Stan przed CI | Reproduktor / zabezpieczenia |
|---|---|---|
| MOBILE-1328-ESCALATE | FIXED-UNVERIFIED | `scripts/smoke-nameplate-serial-dual-v1327.mjs`: niezgodny lub pojedynczy odczyt Code128/OCR kieruje do AI w trybie visual_only; dwa zgodne niezależne źródła nie uruchamiają dodatkowego AI. |
| MOBILE-1328-BLIND | FIXED-UNVERIFIED | API ignoruje podpowiedzi barcodeValues/barcodeDetections w visual_only, a klient nie wysyła ich w tym trybie. |
| MOBILE-1328-RESOLVE | FIXED-UNVERIFIED | Ten sam test: AI ze zgodnym numerem, wysoką pewnością, bez niepewnych znaków i jawną transkrypcją S/N daje automatyczne rozstrzygnięcie. |
| MOBILE-1328-MANUAL | FIXED-UNVERIFIED | AI niepewna, inny numer, brak nadruku, brak odpowiedzi lub zgadywanie: bez automatycznej akceptacji; konieczna ręczna kontrola. |
| MOBILE-1328-LIVE | EXTERNAL | Potwierdzić działanie na rzeczywistym iPhonie i tabliczce w wersji 13.28. |


## MOBILE-1327 — ten sam obraz, rozbieżne odczyty numeru SN (19 października 2026)

| ID | Stan przed CI | Reproduktor / zabezpieczenia |
|---|---|---|
| MOBILE-1327-DOUBLE | FIXED-UNVERIFIED | `scripts/smoke-nameplate-serial-dual-v1327.mjs`: rozpoznanie numeru przez Code 128 i OCR niezależnie, dokładny wynik obydwu metod oznacza automatyczne potwierdzenie. |
| MOBILE-1327-CONFLICT | FIXED-UNVERIFIED | Ten sam test: dwa rozbieżne kandydaty nie wypełniają pola SN, oba są widoczne; wymagane ręczne wpisanie i potwierdzenie ze zdjęcia. |
| MOBILE-1327-WEAK | FIXED-UNVERIFIED | Ten sam test: OCR z jedną próbą/bez etykiety/niska pewność lub jeden czytnik/AI nie są błędnie pokazywane jako podwójnie potwierdzone. |
| MOBILE-1327-MOBILE | FIXED-UNVERIFIED | `tests/e2e/mobile-serial-scanner.spec.js`: ręczna akceptacja SN jest zablokowana bez zaznaczenia kontroli. |
| MOBILE-1327-LIVE | EXTERNAL | Po wdrożeniu sprawdzić na rzeczywistej tabliczce Code 128, odczyt nadruku, ostrzeżenie i numer 13.27 na fizycznym iPhonie. |


## MOBILE-1326 — różne serie JW/JZ (19 października 2026)

| ID | Stan przed CI | Reproduktor / zabezpieczenia |
|---|---|---|
| MOBILE-1326-SAVE | FIXED-UNVERIFIED | `tests/e2e/mobile-serial-scanner.spec.js`: zapis JW Rotenso Imoto + JZ Rotenso Versu Mirror wymaga dwóch świadomych kroków; można wrócić do edycji bez zapisu. |
| MOBILE-1326-FINISH | FIXED-UNVERIFIED | `scripts/smoke-p1-data-integrity-v1261.mjs`: shared validator blokuje mismatch domyślnie, przy jawnym wyjątku przepuszcza Imoto/Versu Mirror, ale nadal blokuje brak JW i JZ. |
| MOBILE-1326-LIVE | EXTERNAL | Po zielonym CI i Vercel READY sprawdzić na fizycznym iPhonie przycisk potwierdzenia tabliczki, zapis oraz niezależną zgodę przy zakończeniu; potwierdzić wersję 13.26. |


Ten plik jest trwałym rejestrem potwierdzonych błędów i testów, które mają zapobiegać ich powrotowi.

## UI-DESKTOP-1320 — kod pocztowy w tabelach Montaże (12 października 2026)

| ID | Stan przed CI | Reproduktor / zabezpieczenia |
|---|---|---|
| UI-DESKTOP-1320-ADDRESS | FIXED-UNVERIFIED | `scripts/smoke-desktop-jobs-layout-width.cjs`: uruchomienie `formatDesktopJobsTableAddress` na rzeczywistych przykładach dla W trakcie, Niezrealizowane i Zakończone, kontrprzykłady brak kodu, pusty adres, nazwa ulicy zawierająca liczby, status Nowe niezmieniony. |
| UI-DESKTOP-1320-VISUAL | REQUIRED | Desktopowe E2E w PR CI + potwierdzenie produkcyjnego wyglądu tabeli po Vercel READY. |

## Zasada

- Każdy potwierdzony błąd otrzymuje stabilne ID.
- Przed oznaczeniem jako CLOSED musi istnieć wykonywalny test regresyjny odtwarzający mechanizm błędu.
- Test pozostaje w stałych grupach CI również po wdrożeniu poprawki.
- Jeżeli problem wymagał sekwencji zdarzeń, dużego fixture, race condition albo konkretnego stanu UI, reproduktor musi zachować ten warunek.
- Dowód zamknięcia wskazuje konkretny plik testu; samo `assert.match` źródła nie wystarcza dla błędu funkcjonalnego.

## Faktury — FAKT-1283 (9 października 2026)

| ID | Stan przed CI | Reproduktor / zabezpieczenia |
|---|---|---|
| FAKT-1283-QUANTITY | FIXED-UNVERIFIED | `scripts/smoke-fakturownia-prefill-v1208.cjs`: pierwsza pozycja ma dosłownie `invoice[positions][0][quantity]=1`. |
| FAKT-1283-PREPARE | FIXED-UNVERIFIED | `scripts/smoke-fakturownia-auto-v1280.mjs`: mock prawdziwej Edge Function sprawdza URL formularza i ilość dokładnie `1`. |
| FAKT-1283-PRICE-GUARD | FIXED-UNVERIFIED | Brak pól cen netto/brutto i sumy faktury oraz jakiegokolwiek tworzenia faktur przez API. |
| FAKT-1283-NONREGRESSION | REQUIRED | Pełne testy WAWIS, Fakturownia v12.80–12.82, Podwójna sesja PG, Playwright i Closure Gate. |
| FAKT-1283-LIVE | EXTERNAL | Przeglądarka Fakturowni: po „Wystaw fakturę” sprawdzić, czy pole ilości faktycznie wyświetla `1`; dokument zapisuje wyłącznie użytkownik. |

## Faktury — FAKT-1282 (9 października 2026)

| ID | Stan przed CI | Reproduktor / zabezpieczenia |
|---|---|---|
| FAKT-1282-GUS-NAME | FIXED-UNVERIFIED | `scripts/smoke-fakturownia-link-v1277.mjs`: firma DIAMOND, skrócona nazwa WAWIS i pełna GUS, inny kod, zgodny poprawny NIP → poprawne rozpoznanie. |
| FAKT-1282-GUS-AUTO | FIXED-UNVERIFIED | `scripts/smoke-fakturownia-auto-v1280.mjs`: serwerowy snapshot i nowa faktura VAT z pełną nazwą GUS → automatyczne potwierdzenie. |
| FAKT-1282-NIP-REFUSE | FIXED-UNVERIFIED | Inny lub brakujący NIP firmy blokowane; osoby prywatne nadal wymagają zgodnych danych i adresu. |
| FAKT-1282-LIVE | EXTERNAL | Odbiór istniejącej faktury DIAMOND przez administratora; bez zmian płatności. |

## Faktury — FAKT-1281 (9 października 2026)

| ID | Stan przed CI | Testy i warunki |
|---|---|---|
| FAKT-1281-SUCCESS-FAST | FIXED-UNVERIFIED | `scripts/smoke-fakturownia-auto-v1280.mjs`: po znalezieniu jednej nowej wystawionej faktury bez OID zwracamy `VERIFIED` i nie odpytujemy o kandydatów do ręcznego powiązania. |
| FAKT-1281-CUSTOMER-FAST | FIXED-UNVERIFIED | Ten sam test: po zapisaniu snapshotu klienta nie ma zbędnego GET `/clients.json` podczas weryfikacji, w razie braku snapshotu pozostała wcześniejsza ścieżka. |
| FAKT-1281-EMERGENCY | FIXED-UNVERIFIED | `scripts/smoke-fakturownia-v1281.mjs`: przyciski awaryjne domyślnie schowane i odtwarzane przez dostępny dla administratora przycisk „Opcje awaryjne”. |
| FAKT-1281-SAFETY | REQUIRED | Wszystkie dotychczasowe scenariusze 12.80: dwa dokumenty, inny klient/instalacja, konflikt, brak OID, duplikat ID. |
| FAKT-1281-LIVE | EXTERNAL | Rzeczywisty pomiar czasu na następnej fakturze po wdrożeniu, bez obietnicy konkretnej liczby sekund. |

## Faktury — FAKT-1280 (9 października 2026)

| ID | Stan przed CI | Reproduktor / zabezpieczenia |
|---|---|---|
| FAKT-1280-SNAPSHOT | FIXED-UNVERIFIED | `scripts/smoke-fakturownia-auto-v1280.mjs`: trwały zapis istniejących faktur przy otwarciu formularza; sprawdzenie pending po przeładowaniu. |
| FAKT-1280-ONE-INVOICE | FIXED-UNVERIFIED | Po wystawieniu jednego nowego dokumentu VAT brak OID nie blokuje automatycznego potwierdzenia. |
| FAKT-1280-SAFETY | FIXED-UNVERIFIED | Odmowa przy 2 nowych fakturach, kolizjach tego samego klienta, zmianie nabywcy, błędnym adresie, już przypisanym ID, starym dokumencie lub wygaśnięciu okna. |
| FAKT-1280-LIVE | EXTERNAL | Rzeczywista faktura wystawiona/drukowana w Fakturowni musi automatycznie dostać status wystawiona po powrocie do WAWIS. |

## Faktury — FAKT-1279 (9 października 2026)

| ID | Stan przed CI | Reproduktor / zabezpieczenia |
|---|---|---|
| FAKT-1279-CLIENT-ID | FIXED-UNVERIFIED | `scripts/smoke-fakturownia-link-v1277.mjs`: istniejąca faktura klienta bez external_id, nadal widoczna po odczycie buyer_name+adres. |
| FAKT-1279-INVOICE-BUYER | FIXED-UNVERIFIED | Dokładne dopasowanie nazwy, ulicy/numeru oraz miejscowości/kodu i NIP; odrzucanie pomyłek adresowych. |
| FAKT-1279-EXPLICIT-ADMIN | FIXED-UNVERIFIED | Bez OID tylko propozycja numeru, ponowna walidacja przy zatwierdzaniu i istniejące RPC SQL unikatowości. |
| FAKT-1279-LIVE | EXTERNAL | Potwierdzenie na rzeczywistych dokumentach przez administratora. |

## Faktury — FAKT-1278 (9 października 2026)

| ID | Stan przed CI | Reproduktor / zabezpieczenia |
|---|---|---|
| FAKT-1278-OID-MISSING | FIXED-UNVERIFIED | `scripts/smoke-fakturownia-link-v1277.mjs`: rzeczywisty kod Edge, klient z unikatowym external_id, wystawiona faktura bez OID wyświetlana jako kandydat, bez automatycznego potwierdzenia. |
| FAKT-1278-WRONG-JOB | FIXED-UNVERIFIED | Ten sam test: obcy OID, inny klient, proforma, szkic, niejednoznaczna kartoteka, faktura powiązana z innym montażem — wszystkie wykluczone. |
| FAKT-1278-ADMIN-ACK | FIXED-UNVERIFIED | UI pokazuje numer i wymaga osobnego kliknięcia administratora; końcowe RPC z unikatowym invoice ID chroni przed duplikacją. |
| FAKT-1278-LIVE | EXTERNAL | Weryfikacja rzeczywistych dokumentów przez administratora. |

## Faktury — FAKT-1277 (9 października 2026)

| ID | Stan przed CI | Reproduktor / blokady |
|---|---|---|
| FAKT-1277-AUTO-REASON | FIXED-UNVERIFIED | `scripts/smoke-fakturownia-link-v1277.mjs`: brak OID zwraca powód; WAWIS wyświetla go oraz umożliwia ponowienie kontroli. |
| FAKT-1277-MANUAL-LINK | FIXED-UNVERIFIED | Ten sam test wykonuje Edge Handler z atrapą Fakturowni: numer, klient external_id, status VAT, obcy OID i brak dopasowania. |
| FAKT-1277-UNIQUE-ID | FIXED-UNVERIFIED | `scripts/smoke-fakturownia-p0-v1260.mjs`: kontrola SQL gwarantuje, że ID faktury nie może trafić do dwóch montaży. |
| FAKT-1277-LIVE | EXTERNAL | Rzeczywiste wystawienie nowych faktur przez administratora i sprawdzenie poprawnego wyświetlenia statusu. Testy automatyczne nie wystawiają realnych dokumentów. |

Bez zmian w oznaczeniach płatności. Do CLOSED: zielone CI dokładnego SHA i test na rzeczywistej fakturze.

## Statusy

- OPEN — błąd potwierdzony, brak kompletnej poprawki/testu.
- FIXED-UNVERIFIED — poprawka istnieje, ale Closure Gate nie potwierdził jeszcze pełnego scenariusza.
- CLOSED — poprawka i trwały test regresyjny przeszły Closure Gate.

## Audyt Codexa 12.72 — pakiet 4 C7–C10 (12.76)

| ID | Stan przed CI | Reproduktor / ograniczenie |
|---|---|---|
| CODEX-CI-PG-READY | FIXED-UNVERIFIED | `scripts/smoke-postgres-readiness-v1276.mjs`: runtime symuluje pg_isready=true zanim baza istnieje, wymaga faktycznego SELECT 1 i odmowy po 40 nieudanych próbach. Odbiór: pełne niezależne PostgreSQL A/B w zielonym CI. |


| ID | Stan przed CI | Reproduktor / ograniczenie |
|---|---|---|
| CODEX-DIAG-C7 | FIXED-UNVERIFIED | `scripts/smoke-diagnostics-package4-v1276.mjs` wykonuje rzeczywisty mobilny handler dla `ok:false`, partial i success oraz desktopowy `refreshServerData` z timeout/empty/unavailable; zachowuje ostatni poprawny stan ze znakiem stale. |
| CODEX-DIAG-C8 | FIXED-UNVERIFIED | Ten sam runtime smoke wykonuje wczesny inline boot observer i scenariusz błędu modułu, testuje fallback i filtruje PII; fizyczny biały ekran iPhone/Safari = EXTERNAL. |
| CODEX-DIAG-C9 | PARTIAL / EXTERNAL | Wykonawcze agregaty zdjęć i operacji offline, właściciel bieżącej sesji, raport bez identyfikatorów i treści; pełne potwierdzenia ACK i correlation ID każdej operacji nie są dodane (istniejące Centrum synchronizacji). |
| CODEX-DIAG-C10 | PARTIAL / EXTERNAL | Wykonawczy kontrprzykład przyjęto-u-dostawcy ≠ wyświetlono-na-telefonie; bez nowego backendu receipts i bez realnego iPhone. |

Do CLOSED wymagane są: aktualny zielony CI dokładnego HEAD PR, Closure Gate, oba E2E, dwusesyjny PostgreSQL i build, a do twierdzenia o dostawie PUSH także rzeczywiste potwierdzenia urządzenia. Nie wysyłać PUSH/SMS/faktur w testach bez jawnej zgody.

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

