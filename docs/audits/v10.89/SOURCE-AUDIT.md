# WAWIS 10.89 — niezależny audyt regresyjny READ-ONLY

**Werdykt: RED.** Potwierdzono błędy P1: nadpisywanie danych kontrahenta, blokadę prawidłowego ponownego uruchomienia PUSH, nieskuteczną idempotencję e-maili, wyścig callbacków SMS, mieszanie draftów paliwa, niekompletny rebuild, blokadę przywracania zakończonych zleceń oraz nadpisywanie nowszych danych urządzeń starszym odczytem. Nie potwierdzono P0 ani przejęcia uprawnień administratora.

## 1. Zakres, SHA i jakość dowodów

| Pozycja | Wynik |
|---|---|
| Repo | wawis-klima/wawis |
| Audytowany main | **ab3a3ad5eb2a3b346800307370f136e5d8b52c43** |
| Wersja | **10.89** |
| Historyczny punkt porównania 10.84 | 74b895c849cdb7644250acf0de7933fc9ef7f1a5 |
| Data | 17.09.2026, Europe/Warsaw; odczyty rozpoczęte około 09:35 |
| Zmiana main w trakcie | Nie stwierdzono; ponowny odczyt main zwrócił ten sam SHA |
| Zmiany źródeł | Brak; git diff w lokalnej kopii pusty. Testy utworzyły lokalne artefakty |
| Operacje zewnętrzne | Odczyty GitHub, katalogów/diagnostyki Supabase i definicji Edge Functions; próby odczytu Vercel |
| Operacje produkcyjne modyfikujące dane | **Żadnych**, również żadnych testowych INSERT/UPDATE z późniejszym rollbackiem |

Przeczytano AGENTS.md, CODEX-AUDIT.md, zasady wydania, checklistę, RELEASE-GATE, workflow, release-policy-gate i odpowiednie sekcje CHANGELOG. Diff 10.84 → main obejmuje 96 plików, 4725 dodanych i 702 usunięte linie. Sprawdzano również wywołujących nowe funkcje i obszary poza tym diffem: panele urządzeń/kontrahentów/paliwa, funkcje produkcyjne kosza, polityki oraz fallback profilu.

**To raport audytu z jawnymi granicami, a nie poświadczenie pełnego wykonania 54 scenariuszy.** Nie wykonano kompletnego rebuilda świeżego Supabase ani wszystkich przeplotów wielu procesów PostgreSQL. PGlite wykonuje prawdziwy PostgreSQL w WASM, ale nie zastępuje wielosesyjnego Supabase/PostgREST/Storage. Harnessy JS uruchamiają funkcje z aktualnego kodu; ich transport/DB/provider są kontrolowanymi atrapami. Nie wysyłano rzeczywistych e-maili, SMS ani PUSH.

Nazwy RED/GREEN w testach repo nie zostały przyjęte jako dowód. Historyczne wykonanie jest wyraźnie odróżnione od porównania tekstu i od kontrolowanego wyłączenia nowego triggera.

### Faktycznie uruchomione testy

| Test | Wynik i ograniczenie |
|---|---|
| npm ci --ignore-scripts --include=optional | Zależności z lockfile, lokalna kopia |
| npm run build | PASS. Pierwsza próba zablokowana przez uprawnienia sandboxa do odczytu katalogu nadrzędnego; ponowienie poza sandboxem PASS. Nie jest to błąd aplikacji |
| 18 wskazanych testów Node z repo | **17 PASS, 1 FAIL**: smoke-audit-fixes-v1086.mjs na CRLF |
| Ten sam test 10.86 z normalizacją odczytów CRLF→LF wyłącznie w pamięci | PASS; źródła pozostają bez zmian |
| 4 specyfikacje E2E: reload, sesje/PUSH, IndexedDB 10.84, atomic offline | **10/10 PASS**, rzeczywisty Chrome, backend mock |
| Cały tests/e2e, 1 worker | **35/36 PASS**. Błąd mobile-photo-two-sessions.spec.js:29 przed uploadem: oczekiwano „Połączenie: Dobre”, faktycznie „Średnie. Wszystko wysłane” |
| sql-counterexamples.mjs | Dokładne migracje: nadpisanie kontaktu; kompletność tabliczek; blokada restore z produkcyjnej definicji; kontrola bez triggera |
| js-counterexamples.mjs | Wykonane funkcje: PUSH nowy endpoint; utrata klucza e-mail; równoległe callbacki; odzyskanie obcego draftu; OLD nadpisuje NEW w DevicesPanel |
| email-edge.mjs | Pełny handler Edge po usunięciu typów TS; provider akceptuje, gubi odpowiedź; retry po 25 h wysyła drugi egzemplarz w modelu kontraktu Resend |
| role-matrix.mjs | Wybrane rzeczywiste definicje produkcyjnego RLS/guardów: admin, worker, pending, brak profilu, anon |
| push-db.mjs | Rzeczywista funkcja PostgreSQL tworzy nowy endpoint z generation=1; rzeczywisty guard SW go odrzuca po terminal CLEAR |
| Produkcja: konto bez profilu + metadata.role=Administrator | SELECT w READ ONLY przy SET LOCAL ROLE authenticated: staff=false, admin=false; jobs/contractors/devices/photos/fuel_entries = 0 |

Testy Node: smoke-storage-write-reconciliation-v1074, smoke-storage-delayed-commit-v1077, smoke-session-sync-resilience-v1080, smoke-update-reload-guard-v1081, smoke-update-reload-guard-v1082, smoke-session-push-gate-v1083, smoke-audit-races-v1084, smoke-audit-fixes-v1086/v1087/v1088, smoke-nameplate-ai-auth-v1085, smoke-smsapi-webhook-security-v1085, smoke-playwright-runner-fail-closed-v1085, smoke-release-policy-pr-head-v1085, smoke-worker-contractor-update-v1089, smoke-destructive-rls, test-job-protocol-storage-v979, smoke-push-safety-v1078. PASS oznacza wyłącznie spełnienie asercji danego testu; część to kontrole tekstu.

## 2. Findings

W kolumnie „Dowód” odnośniki prowadzą do niezmiennego audytowanego SHA. Szczegóły i ograniczenia reprodukcji znajdują się poniżej.

| ID | Severity | Obszar | Problem | Dowód plik/linia | Reprodukcja | Skutek | Minimalna poprawka | Wymagany test |
|---|---|---|---|---|---|---|---|---|
| A01 | **P1** | Contractor sync | Zmiana jednego pola montażu przepisuje cały stary kontakt i adres lokalizacji na główny adres klienta | [trigger:21,76,95][s01] | Nazwa montażu w filii zmieniona; główny adres HQ→Branch, aktualny tel. 222→111 | Cicha utrata aktualnych danych klienta | Aktualizować tylko jawnie zmienione pola; ustalić wybrany adres; kontrolować wersję/kontrahenta | Nazwa-only + drugi adres + nowszy telefon klienta pozostają poprawne |
| A02 | **P2** | Nameplates | Zakończone zlecenie nie jest ponownie sprawdzane przy zmianie listy urządzeń | [guard:147][s02] | Zakończyć split z JW/JZ, potem admin dodaje drugi split w device_model | Status zakończony mimo brakującego kompletu | Walidować też zmiany pól wyznaczających wymagania w stanie Zakończone | Dodanie urządzenia/JW do zakończonego zlecenia bez zdjęć odrzucone |
| A03 | **P1** | PUSH | SW porównuje generation różnych endpointów jak jeden globalny licznik | [guard:28–50][s03], [SW zapis][s04] | A endpoint E1 g=1 → logout/CLEAR → nowy E2 dla B g=1 | Legalny SET B odrzucony; PUSH pozostaje wyłączony | Rozdzielić epoch kontekstu od generation endpointu; przenosić tożsamość subskrypcji | E1→E2 po logout oraz stare E1 po nowym B |
| A04 | **P1** | E-mail | Jeden slot próby oraz brak granicy czasu idempotencji providera | [client:3,69][s05], [Edge:108–204][s06] | A pending → wysyłka B → retry A nowym key; osobno retry tym samym key po 25 h | Ponowna wysyłka tego samego protokołu po utracie odpowiedzi | Trwała mapa prób per user/operacja i serwerowe reconciliation; po TTL nie wysyłać w ciemno | Lost response + inny protokół + reload; retry 25 h; współbieżność |
| A05 | **P1** | SMS callback | Monotoniczność sprawdzana przed UPDATE bez CAS/atomowości | [webhook:84,130,140][s07] | SENT czyta queued i czeka; DELIVERED zapisuje; spóźniony SENT nadpisuje | Regres doręczenia oraz możliwy regres pól jobs | Warunkowy UPDATE/ranking pod blokadą; chronić także tożsamość ostatniej wysyłki | Dwa realne callbacki z kontrolowaną barierą READ→UPDATE |
| A06 | **P1** | Fuel / sesje | Trwała próba paliwa nie ma właściciela; każdy montaż komponentu ją odtwarza | [FuelPanel:27–50,172,288][s08] | A pozostawia niepotwierdzoną próbę; B otwiera paliwo w tym samym origin | Draft/entryId/photoPath A trafiają do formularza B; możliwe błędne przypisanie ręcznej próby | Namespace userId i kontrola właściciela przed restore, zapisem i cleanupem; CAS w wielu kartach | A pending → B; B nie widzi/reużywa próby A; dwie karty |
| A07 | **P1** | N7 rebuild | Brakuje definicji wymaganych produkcyjnych funkcji i prywatnych tabel | [triggers:29][s09], [Storage:28][s10], [ACL:43][s11] | Baseline tworzy trigger do nieistniejącej archive_job_before_delete; w 160 śledzonych SQL brak jej CREATE | Świeży backend nie odtwarza produkcji; rebuild przerywa się | Dodać brakujące wersjonowane DDL w rebuild, jawny manifest kolejności i migracje 10.89 na końcu | Pusta baza → całość bez ręcznych DDL → katalog i role; drugi przebieg |
| A08 | **P2** | N8 / dowody | Test 10.88 nazywa regexy „RED reproduced” i „behavioral contracts closed” | [test:12–84][s12] | Test PASS mimo A02/A04; brak wywołań testowanych zapisów/providerów | Fałszywe domknięcie N2–N5; niewykrywane regresje | Wykonywać te same scenariusze na historycznym i aktualnym module/DB | RED na starym SHA, GREEN na nowym, mutation control |
| A09 | **P1** | Kosz + N2 | Nowy guard uniemożliwia restore zakończonego zlecenia przed przywróceniem zdjęć | [guard:147–153][s02]; produkcyjna admin_restore_deleted_job, instrukcja INSERT jobs przed pętlą photos | Odtworzenie live funkcji lokalnie: job_nameplates_incomplete; bez nowego triggera restore przechodzi | Zakończone karty nie dają się odzyskać zwykłym RPC admina | Przywrócić niekońcowy stan, zdjęcia, następnie zakończyć i odtworzyć metadane w jednej transakcji | Delete→restore zakończonej karty wraz z pełną historią i zdjęciami |
| A10 | **P2** | Testy Windows | Literalny newline w teście 10.86 nie obsługuje CRLF | [test:13][s13] | Czysty checkout Windows FAIL; normalizacja odczytu w RAM PASS | Fałszywy NO-GO na Windows, pominięcie dalszych testów w pliku | Normalizować CRLF przed asercjami | Ten sam kod LF/CRLF ma ten sam wynik |
| A11 | **P1** | Devices / F5,F8 | Loader panelu urządzeń nie ma request/session guard przed setState | [DevicesPanel:286–308][s14] | Dwa wykonania: NEW kończy się przed OLD; finalny stan OLD | Stary widok nadpisuje nowsze dane; błędny stan loading/error | RequestId + session token po await; cleanup unmount | OLD/NEW, odmontowanie, zmiana konta; analogicznie panele paliwa/kontrahentów |

### Szczegóły reprodukcji i dlaczego istniejące testy nie chronią

**A01.** Uruchomiono dokładny SQL nowego triggera, nie tłumaczenie jego logiki na JS. Kontrahent ma główny adres HQ/Main i dodatkowy Branch/Other; montaż wskazuje dodatkowy adres i starszy numer telefonu. Sama korekta nazwy montażu zmienia u kontrahenta również telefon oraz główny adres, mimo że użytkownik ich nie edytował. Dodatkowy adres nie jest usunięty, ale główny zostaje nadpisany jego danymi. Test 10.89 sprawdza obecność nazw pól i brak notes/nip; nie sprawdza wartości OLD/NEW ani contractor_address_id. Kontrola bez nowego triggera zachowuje kontakt. Zmiana contractor_id i kontaktu w jednym żądaniu kieruje zapis do NEW.contractor_id; potrzebny osobny kontrakt, kiedy taka zmiana jest legalna. Nie utożsamiam zamierzonego prawa pracownika do edycji kontaktu z eskalacją uprawnień.

**A02.** Brak JW/JZ przy przejściu W trakcie→Zakończone jest rzeczywiście blokowany. Usunięcie wymaganego zdjęcia zakończonej karty także. Natomiast warunek guardu obejmuje tylko INSERT lub zmianę starego statusu na Zakończone. Admin może później zwiększyć wymagany komplet bez nowej walidacji. Reprodukcja dotyczy uprawnionego admina; worker ma dodatkowy guard edycji zakończonej karty. Nie jest to nowa możliwość administratora względem 10.84, lecz luka w nowym inwariancie N2. Wyścigi dwóch transakcji i model multi-split wymagają osobnego PostgreSQL concurrency testu.

**A03.** Produkcyjna push_subscription_sync_atomic nadaje nowemu endpointowi generation=1. Logout faktycznie wywołuje unsubscribe, więc powstanie nowego endpointu jest normalnym scenariuszem. SW zachowuje terminal floor poprzedniego endpointu; odrzuca mniejszą generację albo równą po terminal CLEAR. Sprawdzono dokładną funkcję SQL oraz guard SW. Dla starego guardu 10.84 wykonano odpowiednik z rosnącą revision: został zaakceptowany. Testy A→B z jednym endpointem i ręcznie podanymi 6→7 lub 2→9 nie wykrywają zmiany zakresu licznika. Proste usunięcie floor byłoby niebezpieczne: przywróciłoby możliwość późnego SET A.

**A04.** Klient przechowuje tylko jeden obiekt protocol-email-attempt-v1088. Utworzenie próby B zastępuje A; powrót do A generuje nowe UUID. Serwerowy rate limit obejmuje tylko 30 s i nie jest trwałą deduplikacją logicznej operacji. Drugi, niezależny kontrprzykład uruchamia cały handler Edge: provider przyjmuje wiadomość, transport gubi odpowiedź, log pozostaje sending, retry tym samym key po 25 h ponawia POST. Model providera zachowuje oficjalny limit **24 godzin** i dostarcza drugi egzemplarz. To test z kontrolowanym providerem, nie eksperyment na żywym Resend. Źródło kontraktu: [Resend — Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys). Dodatkowo timer jest kasowany po fetch headers, przed safeResponseJson; nie obejmuje wiszącego body. Trzeba utrwalić też wersję/payload PDF, aby ten sam key nie zmieniał treści po replacement. Brak testu rzeczywistego kontraktu idempotencji w smoke 10.88 pozwala wszystkim tym ścieżkom przejść.

**A05.** Harness wykonuje funkcję applyDeliveryStatus wyciętą bez zmian logicznych z TS i usuwa jedynie typy. Sterowany klient zatrzymuje niższy status po READ, przepuszcza DELIVERED, potem kończy stary UPDATE. Finalnie sms_log.status=provider_sent. Dotychczasowy test sprawdza czystą funkcję rankingu i sekwencyjny retry, a nie atomowość aktualizacji. Ten sam mechanizm dotyczy jobs: warunek „ostatnia wysyłka” jest oceniany na wcześniejszym snapshotcie. Błąd pozostał po naprawie 10.85; nie ma dowodu, że dopiero ta naprawa go wprowadziła.

**A06.** Dokładne helpery zapisu/odczytu przywracają entryId i photoPath A bez żadnego parametru userId. Efekt montażu kopiuje również litry i przebieg. Nie wykonano odczytu prywatnego zdjęcia A jako B i nie ma dowodu obejścia Storage RLS. Potwierdzony jest wyciek/mieszanie lokalnego draftu i identyfikatora operacji. Fingerprint nie zawiera użytkownika, czasu rzeczywistego tankowania ani tożsamości zdjęcia; jedna globalna pozycja localStorage i stan React bez transakcji nie stanowią koordynacji dwóch kart. Test musi osobno odróżnić ponowienie jednej próby od dwóch prawdziwych tankowań o tych samych wartościach.

**A07.** W produkcji istnieją, a w śledzonych SQL brak CREATE FUNCTION dla: public.claim_service_sms, public.confirm_service_sms, private.archive_job_before_delete, public.admin_list_deleted_jobs, public.admin_restore_deleted_job, public.job_file_can_be_deleted. Brak także deklaracji private.job_recycle_bin; prywatne sms_delivery_claims również wymagają ujęcia w deterministycznym źródle. Baseline odwołuje się do archiwizatora przy CREATE TRIGGER i do job_file_can_be_deleted w policy. Wykonanie zależnego CREATE TRIGGER w lokalnej bazie bez tej funkcji kończy się błędem PostgreSQL. Nie jest to różnica formatowania pg_get_functiondef. Nie twierdzę, że wykonano pełny replay Supabase: wykazano brak koniecznych elementów wejściowych. README rebuild zatrzymuje standardowy replay na 10.88 i nie nakazuje zastosowania późniejszego contact-update 10.89 po baseline. Nowy smoke sumuje teksty GRANT/RLS, nie wykonuje kolejności i zależności.

**A08.** Test historycznie odczytuje rzeczywisty SHA, co jest lepsze od ręcznej atrapki starego kodu, ale asercja regexu o braku entryId lub AbortController nie odtwarza duplikatu ani timeoutu. „GREEN” nadal jest regexem. Test 10.87 zawiera realne wywołania guardu SW, ale jego F10/F11 nadal mają dowód przede wszystkim źródłowy. Nazwa testu ani końcowe console.log nie stanowią certyfikacji behawioralnej.

**A09.** Funkcja live najpierw wykonuje INSERT jobs ze snapshotu, potem odtwarza photos. N2 działa BEFORE INSERT i widzi pusty komplet. Reprodukcja używa dokładnej definicji pobranej z produkcji i dokładnej migracji N2. Kontrola polegająca na usunięciu wyłącznie triggera N2 pozwala temu samemu restore odtworzyć dwa zdjęcia. To kontrolowana ablacja, nie pełny replay historycznego produkcyjnego SHA — funkcji restore brakuje w repo. Archiwum pozostaje dostępne administratorowi bazy; nie zgłaszam nieodwracalnego zniszczenia archiwum ani P0.

**A10.** FAIL zatrzymywał test przed częścią behawioralną. Po normalizacji odczytów w pamięci ten sam test wykonuje również spóźniony SIGNED_OUT, własność kolejki i kontrakt requestId/cursor oraz przechodzi. Nie raportuję błędu Auth na podstawie tego failure.

**A11.** Uruchomiono samą funkcję loadDevices z rzeczywistego komponentu z kontrolowanymi Promise i setterami. Dwa efekty startowe oraz kolejne zmiany jobs mogą uruchomić kilka odczytów. Pierwszy odczyt zakończony ostatni bezwarunkowo ustawia devices. Jest to błąd również w jednej sesji, więc nie zależy od spornego scenariusza dwóch adminów. Panele kontrahentów i paliwa mają podobne niewersjonowane loadery; potrzebują testów pochodnych, ale nie uznaję każdej ich ścieżki za osobny odtworzony finding. Ten obszar nie zmienił się w diffie 10.84→10.89.

## 3. F1–F13 i N1–N9

Status odnosi się do całego opisanego punktu, a nie do pojedynczego zielonego testu. PARTIALLY FIXED może oznaczać poprawne wykonane podprzypadki i nadal otwarty zakres weryfikacji; konkretny powód podano w tabeli.

| Punkt | Status | Dowód / granica |
|---|---|---|
| F1 | **VERIFIED FIXED** | Realny React rerender oraz późny blocker przed timerem w Chrome PASS; moduł ponawia reload po zwolnieniu ostatniej blokady. Brak osobnego historycznego uruchomienia Reacta |
| F2 | **VERIFIED FIXED** | Realne formularze paliwa/komentarza rejestrują dirty i beforeunload w Chrome; nowe problemy z trwałą próbą paliwa są osobno A06 |
| F3 | **PARTIALLY FIXED** | Stary token A po przejściu na B nie publikuje; nie przeprowadzono całego getPushStatus z realnym SW i zmianą endpointu; A03 |
| F4 | **PARTIALLY FIXED** | Restore A po login B PASS mobile/desktop; późny SIGNED_OUT PASS po kontroli CRLF. Nie wszystkie ścieżki loginUser/error/loading mają dowód izolacji |
| F5 | **PARTIALLY FIXED** | Guardy summary/details/queue obecne i częściowo testowane; loader urządzeń rzeczywiście nadpisuje nowsze dane (A11), paliwo ma problem właściciela (A06) |
| F6 | **PARTIALLY FIXED** | Fuel Edge live ma recipient/generation i atomic expiration; nie wykonano doręczenia rzeczywistego PUSH przez OS po zmianie konta |
| F7 | **PARTIALLY FIXED** | Fallback wywołuje otwarte szczegóły i refresh; brak pełnego testu odciętego Realtime + realnego komentarza/zdjęcia w dwóch sesjach |
| F8 | **PARTIALLY FIXED** | Kontrakt współdzielonego fetch requestId PASS; panel urządzeń pozostaje poza ochroną, A11 |
| F9 | **PARTIALLY FIXED** | Chrome: snapshot/cursor race i usunięta kolejka PASS; kontrakt potwierdzenia trwałego snapshotu PASS. Brak wszystkich abort/versionchange/close i wielu kart |
| F10 | **PARTIALLY FIXED** | Test body-timeout klienta PASS; widoczne ograniczenia PushManager. Brak dowodu ograniczenia wszystkich lifecycle; e-mail timer kończy się przed body |
| F11 | **PARTIALLY FIXED** | Live tombstone, revoke direct writes i atomic expire; brak wszystkich wielosesyjnych przeplotów i testu retencji; A03 pokazuje inny błąd lifecycle |
| F12 | **VERIFIED FIXED** | Faktyczny job CI 35192932068 wykonał kroki Install Chromium, Run required Playwright E2E oraz production build, wszystkie success |
| F13 | **PARTIALLY FIXED** | Chrome: clean modal nie ma warningu, dirty ma; warning jest oddzielony od blokady update. Czysty PDF i zapis PDF wymagają dalszych dedykowanych przeplotów |
| N1 | **PARTIALLY FIXED** | Handler OCR testowany z metadata/admin, missing/pending profile; serwer ufa profiles. Frontend nadal ma fallback user_metadata.role/Pracownik, więc nie certyfikuję całego punktu jako zamkniętego |
| N2 | **PARTIALLY FIXED** | Wykonany SQL blokuje brak JW/JZ i usunięcie zdjęcia; A02 i A09; brak pełnego concurrency testu |
| N3 | **PARTIALLY FIXED** | Rzeczywisty moduł storage i delayed commit test PASS; CAS storage_path w kodzie; brak dwóch realnych klientów PostgREST i pełnego testu cleanup po CAS |
| N4 | **PARTIALLY FIXED** | Stabilny UUID i reconciliation w module; A06; brak atomowej koordynacji dwóch kart i rozróżnienia osobnych identycznych tankowań |
| N5 | **PARTIALLY FIXED** | Zwykły retry tym samym key jest obsługiwany; A04 odtwarza naruszenia deklarowanej gwarancji |
| N6 | **PARTIALLY FIXED** | Token/ranking/sekwencyjny retry testowane, live kod zgodny; równoległość łamie monotoniczność (A05) |
| N7 | **PARTIALLY FIXED** | Baseline odtwarza wiele obiektów, ale konieczne zależności są nieobecne (A07); pełny rebuild NOT VERIFIED |
| N8 | **PARTIALLY FIXED** | Wczytywany jest autentyczny stary SHA, a część testów wykonuje funkcje. N2–N5 w 10.88 to regexy (A08) |
| N9 | **PARTIALLY FIXED** | Rzeczywiste CI E2E/build oraz lokalny niezerowy exit przy failing E2E; CRLF nadal psuje test 10.86 (A10). Konfiguracja branch protection niezweryfikowana |

VERIFIED FIXED w wąskich F1/F2/F12 oznacza wykonany test zachowania danego mechanizmu; nie oznacza kompletnej historycznej walidacji każdego formularza i każdego urządzenia. Nie przypisuję REGRESSED tam, gdzie nie ma dowodu wcześniejszego pełnego domknięcia danej gwarancji.

## 4. NEW REGRESSION INTRODUCED BY FIX

| Problem | Zmiana wprowadzająca | Dowód przyczynowy |
|---|---|---|
| **A01 — NEW REGRESSION INTRODUCED BY FIX** | 10.89, d3dc837, nowy worker contact-sync | Identyczna edycja bez triggera zachowuje HQ/telefon; z dokładnym nowym triggerem niszczy te wartości |
| **A03 — NEW REGRESSION INTRODUCED BY FIX** | 10.87, 129053a, porządek SW oparty o generation | Historyczny guard 10.84 przyjmuje nowy endpoint przy nowszej revision; nowy odrzuca generation=1 po CLEAR |
| **A06 — NEW REGRESSION INTRODUCED BY FIX** | 10.88, 760849f, trwała próba paliwa | Nowy globalny storage slot jest odtwarzany bez userId; wcześniej nie było tego mechanizmu |
| **A09 — NEW REGRESSION INTRODUCED BY FIX** | Guard 10.88; finalna korekta SQL 6009b65 | Dokładny restore live działa po wyłączeniu tylko nowego triggera. Historycznej definicji backendu w repo brak — tę granicę dowodu zachowano |

A04 to niedomknięcie wcześniejszego błędu idempotencji i nowa zawodna implementacja próby; brak podstaw do twierdzenia, że duplikaty nie występowały w 10.84. A05/A11 są pozostałymi błędami. A07 oznacza niespełnioną deklarację odtwarzalności nowego baseline, nie nowo uszkodzoną produkcyjną bazę. A02 jest luką nowego guardu, bez dowodu utraty wcześniej istniejącej ochrony. A08/A10 to problemy jakości nowych testów.

## 5. Produkcja vs repo

Produkcja Supabase: uohziyaudbpwmupvljyd. Odczytano 59 SECURITY DEFINER w public/private wraz z definicjami, config i efektywnym EXECUTE, polityki, RLS, triggery, bucket flags i cron. Szczegółowy inwentarz jest w osobnym pliku SECURITY-DEFINER.md; pełne definicje w dowodach. Nie jest to automatyczne uznanie każdej funkcji za bezpieczną.

| Obszar | Wynik |
|---|---|
| Contractors RLS | Live staff SELECT, INSERT/UPDATE/DELETE tylko admin; lokalna macierz na pobranych definicjach potwierdza brak szerokiego zapisu worker |
| Pending/no profile | Live no-profile z podszytym metadata.role: zero w pięciu tabelach. Pending/admin/worker wykonano lokalnie na wybranych rzeczywistych policies, nie jako żywe konta |
| Rejestracja | Live auth.users ma trigger on_auth_user_created → handle_new_user; funkcja nadaje Oczekujący, ignoruje metadata.role |
| Public tables RLS | Wszystkie odczytane zwykłe public tables mają RLS enabled |
| Private tables | job_recycle_bin i sms_delivery_claims bez RLS, ale private schema i ich ACL nie udostępniają ich rolom aplikacji. Nie zgłaszam automatycznie jako ekspozycji REST |
| Private nameplate functions | Efektywny EXECUTE przez PUBLIC istnieje, lecz private nie ma USAGE dla ról aplikacji. Nie jest to samo co publiczne RPC |
| SECURITY DEFINER baseline | Advisor nadal: 1 INFO no policy, 15 mutable search_path, 3 anon-executable, 33 authenticated-executable. Liczby zgodne z przekazanym baseline; nie są nową regresją |
| 3 anon public SD | admin_list_deleted_jobs/admin_restore_deleted_job mają guard admin; job_file_can_be_deleted wymaga auth.uid i prawa dostępu. Same GRANT nie dowodzą exploita |
| Mutable search_path | Osobny dług: nie wykazano konkretnego wykorzystania. App roles nie mają CREATE w public/private według odczytanego ACL; sprawdzanie parametrycznych ścieżek nadal wymagane |
| Storage | WaWis public=true; job-photos/job-protocols/fuel-odometer-photos private. Nie sprawdzano zawartości publicznego legacy bucketu, więc nie stwierdzono, czy zawiera poufne pliki |
| Cron | wawis-stale-new-jobs-v1079 aktywny, 17 * * * *; sama konfiguracja nie dowodzi wykonań ani poprawnego wyniku każdego uruchomienia |
| E-mail + SMS callback | Pobrany kod live zgodny z repo po normalizacji CRLF; findings A04/A05 dotyczą tej samej logiki co produkcja |
| Assignment PUSH | Różnice live/repo ograniczają się w odczytanym diffie do komentarzy |
| Fuel PUSH | Live pomija nieużywane zmienne budujące starą treść i ma inne wcięcia; nie wykazano zmiany semantyki ochrony |
| Edge inventory | Aktywne: send-assignment-push v15, send-service-sms v24, generate-service-sms-queue v12, smsapi-delivery-webhook v4, send-job-protocol-email v4, send-fuel-entry-push v4 |
| Pozostałe Edge | Pełnej treści send-service-sms/generate-service-sms-queue nie porównano live/repo w tym przebiegu |
| Rebuild parity | Niezgodność źródła z produkcją: brak definicji A07; nie przeprowadzono pełnego nowego staging rebuild |
| Vercel | GitHub status success dla dokładnego main; [deployment](https://vercel.com/wawis/wawis-klima/BY77b5mjU6UbpMYP1Czj8LHkzW1n). Konektor Vercel zwraca 403 dla scope wawis, więc nie odczytano runtime ani domeny produkcyjnej |
| Wersja live strony i SW | **NOT VERIFIED ON PRODUCTION**. Telemetria zawiera 10.89, lecz nie zastępuje odczytu pliku i SW z aktualnej domeny |
| Signup settings / Leaked Password Protection | **NOT VERIFIED ON PRODUCTION**; trigger profilu to inna warstwa niż konfiguracja Auth |
| Pełne REST role matrix, zmiana roli/old JWT, Storage restore | **NOT VERIFIED ON PRODUCTION**; brak mutacyjnych testów live zgodnie z READ-ONLY |

Nie trzeba przywracać ZIP/Drive/post-deploy workflow. W sprawdzonych workflow/skryptach nie ma automatycznej ścieżki aplikującej rebuild SQL do produkcji. Potrzebna jest izolowana bramka odtwarzalności i brakujących zależności, a nie drugi powielający workflow release.

### Diagnostyka 10.89 — aktualizacja przekazanego baseline

Potwierdzono warningi network/contractors/devices w 07:12:29.941–943 UTC (09:12:29 w Polsce), wszystkie Failed to fetch. **Jest późniejszy error**: 07:19:55.227 UTC (09:19:55), app / console.error / mobile, online=true, queue_pending=0, queue_errors=0. Jego zapis to wyłącznie [REDACTED_TEXT], bez error_code. Nie można uznać za potwierdzone zdania „po tej paczce nie było error/fatal”; nie można też przypisać zredagowanego wpisu do konkretnej regresji.

Kod kontrahentów zachowuje poprzednią listę w catch, a finally zwalnia loading. Pierwszy nieudany odczyt może pozostawić listę pustą/fallbackową do kolejnego wywołania; loader nie ma własnego retry/backoff. DevicesPanel zachowuje dane w catch i zwalnia loading, ale globalne wyszukiwanie urządzeń w App.jsx:795–808 czyści swój katalog na błąd. Odczyt globalnych kontrahentów nie ma automatycznego ponowienia bez zmiany zależności efektu. Nie ma dowodu, że jedna wspólna paczka warningów jest nieszkodliwa; nie wykazano jednak związanej z nią utraty danych DB. Osobny A11 odtwarza konflikt kolejności loadera.

## 6. Obowiązkowa macierz 54 scenariuszy

PASS = wykonany określony podprzypadek; CZĘŚĆ = istnieje dowód tylko części; FAIL = odtworzony kontrprzykład; PROJEKT = gotowy scenariusz do wykonania, bez deklaracji wyniku. Mock transportu i test modułu nie są równoważne kompletnemu runtime produkcyjnemu.

| Nr | Status | Wykonanie albo brakujący konkretny test |
|---|---|---|
| 1 | PASS | Chrome: restore A pending → SIGNED_IN B → resolve A, desktop/mobile |
| 2 | PASS | Node 10.86 po normalizacji LF: SIGNED_OUT verification A → B → reject A; B pozostaje |
| 3 | CZĘŚĆ | Session helper/queue testy; potrzebna bariera osobno summary/details/photo/device/fuel i wszystkie setError/setLoading |
| 4 | FAIL | DevicesPanel NEW→OLD nadpisany, A11; core request helper PASS |
| 5 | PROJEKT | Rozpocząć każdy loader, logout/unmount, zakończyć reject/resolve i sprawdzić brak zapisów UI/cache |
| 6 | FAIL/CZĘŚĆ | Guard tokenów działa, ale logout z nowym endpointem blokuje B, A03 |
| 7 | CZĘŚĆ | Stary token publikacji A odrzucony; brak równoległego DB sync dwóch sesji |
| 8 | CZĘŚĆ | Wykonany guard SW CLEAR A kontra B; potrzebny żywy RPC disable z opóźnioną transakcją |
| 9 | PROJEKT | Ustanowić B w SW; dostarczyć payload A przez push event; zero showNotification |
| 10 | PROJEKT | Dwie sesje DB, A→B→logout B, bardzo późny sync A; kontrola tombstone i generation |
| 11 | FAIL/CZĘŚĆ | Nowy endpoint generation=1 odrzucony; zmiana kluczy tego samego endpointu wymaga testu pełnego lifecycle |
| 12 | CZĘŚĆ | Live payloady obu Edge sprawdzone; brak OS delivery na urządzeniu |
| 13 | PROJEKT | Wstrzymać response 410 dla A, przejąć endpoint B, zwolnić response; owner/generation B bez zmian |
| 14 | CZĘŚĆ | Smoke pending retry PASS; potrzebny reboot/offline→online z rzeczywistym SW/DB |
| 15 | PASS modułu | Testy reconciliation importują prawdziwy storage/fuel kod, commit + utracona odpowiedź |
| 16 | PASS modułu | Delayed commit po pustym readback nie usuwa nowego PDF/zdjęcia w kontrolowanym Storage |
| 17 | CZĘŚĆ | Moduł protocol-storage testowany; potrzebne dwie realne transakcje/klienci i kontrola plików |
| 18 | CZĘŚĆ | CAS obecny i test storage PASS; nie certyfikowano całego REST konfliktu |
| 19 | CZĘŚĆ | Sprawdzone ścieżki cleanup; konflikt zachowuje upload, może pozostawić sierotę; wymagany test pliku konkurenta |
| 20 | PASS | Chrome IndexedDB: wymiana operacji przy błędzie zapisu zachowuje poprzednią |
| 21 | PASS | Chrome: spóźniony update nie wskrzesza zastąpionej/usuniętej operacji |
| 22 | PROJEKT | Dwie strony jednego origin: jednoczesny replace, update i retry; jedna logiczna operacja |
| 23 | PASS/CZĘŚĆ | Chrome snapshot/cursor w jednej stronie; potrzebne także dwa niezależne fetch/cache writers |
| 24 | PASS | Chrome cursor 3 nie cofnięty przez wiele prób ustawienia 2 |
| 25 | PROJEKT | Zatrzymać write tx przed commit, zamknąć stronę; nowa strona widzi spójne OLD albo NEW |
| 26 | PASS | Chrome prawdziwy React rerender formularza nie zwalnia ochrony |
| 27 | PASS | Chrome timer ponownie sprawdza nowy blocker |
| 28 | PASS/CZĘŚĆ | Dirty paliwo przed reload chronione; trwały draft ma odrębny błąd A06 |
| 29 | PASS | Chrome komentarz inline rejestruje dirty warning |
| 30 | CZĘŚĆ | Testy protokołu PASS; potrzebny celowo opóźniony upload/DB commit i update SW w chwili podpisu |
| 31 | CZĘŚĆ | Mechanizm clean modal sprawdzony; dedykowany clean stored-PDF + beforeunload do dodania |
| 32 | PASS lokalny | Dokładne wybrane policies: admin odczyt i update klienta |
| 33 | PASS lokalny | Worker odczyt klienta/montażu; direct update/insert oraz admin delete RPC odrzucone |
| 34 | PASS lokalny | Pending odczyt jobs/contractors=0, direct insert/admin RPC odrzucone |
| 35 | PASS live read-only | Brak profilu + crafted metadata: zero w pięciu tabelach |
| 36 | PASS lokalny | Anon bez uprawnień do contractors; pełny anon REST/Storage jeszcze do wykonania |
| 37 | PASS lokalny/live katalog | Staff SELECT rzeczywiście działa w macierzy; live policy zgodna |
| 38 | CZĘŚĆ | Direct INSERT worker odrzucony; RPC ma guard profilu; end-to-end create-or-get do dodania |
| 39 | FAIL | Kontakt zmieniany przez job, ale przepisuje nieedytowane pola/adres, A01 |
| 40 | CZĘŚĆ | Trigger ustawia tylko wskazane kontaktowe kolumny; nie wykonano pełnego crafted payload z każdym admin field |
| 41 | CZĘŚĆ | RPC delete worker odrzucone; policy DELETE admin-only odczytana; osobny REST DELETE wymagany |
| 42 | CZĘŚĆ | Przetestowano admin_delete_contractor; pozostałe SD zinwentaryzowane, nie każda kombinacja parametrów wykonana |
| 43 | CZĘŚĆ | Worker ma visibility wszystkich jobs; policy comments wymaga widoczności i otwartej karty. Pełny test unassigned comment do dodania |
| 44 | PASS lokalny SQL | Jeden split: bez photos fail, para JW/JZ pass |
| 45 | PROJEKT | 2 splity i multi JW1..JW5: sprawdzić każdą brakującą pozycję oraz parytet parsera frontend/SQL |
| 46 | PASS lokalny SQL | Pusty komplet zawiera brak JW; test pojedynczo brakującego JW do rozszerzenia |
| 47 | PASS lokalny SQL | Usunięcie JZ po completion odrzucone |
| 48 | PROJEKT | Dwie sesje PostgreSQL: INSERT ostatniej tabliczki vs completion; sprawdzić czekanie i snapshot |
| 49 | CZĘŚĆ | Sekwencyjny DELETE odrzucony; równoległy DELETE/UPDATE vs completion do wykonania |
| 50 | PASS CI | Job 105109366323 ma rzeczywisty krok E2E success, nie skipped |
| 51 | CZĘŚĆ | Lokalny failing E2E dał exit 1; nie tworzono celowo failing PR ani nie sprawdzano merge ruleset |
| 52 | CZĘŚĆ | childExitCode odrzuca null status/spawn error/signal; brak pełnego subprocess testu po usunięciu executable |
| 53 | CZĘŚĆ | Build wymagany w workflow, udany lokalnie/CI; nie zmieniano kodu aby zepsuć build na PR |
| 54 | CZĘŚĆ | Rebuild w osobnym katalogu, brak automatycznej aplikacji w odczytanych skryptach; konfiguracja zewnętrznych integracji niepełna |

Dodatkowe obowiązkowe scenariusze spoza numerowanej listy: A09 restore zakończonego joba, A04 retry po TTL providera, A01 edycja nazwy w dodatkowej lokalizacji, A06 draft po zmianie użytkownika, N7 brakujące DDL.

## 7. Zalecenia i minimalny plan

### A. Potwierdzone P1 przed dalszym rozwojem

1. **A01:** kontrakt patchowania kontaktu i adresów; nie przepisywać pełnego snapshotu montażu.
2. **A03:** naprawić zakres generation przy zmianie endpointu bez osłabienia ochrony przed późnym A.
3. **A04:** trwała wieloelementowa tożsamość wysyłek oraz reconciliation poza oknem idempotencji providera.
4. **A05:** atomowy monotoniczny zapis callbacków i powiązanie ze świeżą wysyłką.
5. **A06:** izolować próby tankowania po właścicielu; oddzielić retry od nowej operacji.
6. **A07/A09:** uzupełnić brakujące źródła backendu i naprawić restore w obecności N2.
7. **A11:** request/session guards dla loaderów paneli oraz ich error/loading.

Nie rekomenduję rollbacku całej serii: wycofałby też rzeczywiste zabezpieczenia. Każda naprawa powinna być mała i oparta o dołączony kontrprzykład.

### B. Potwierdzone P2

A02 — walidacja zmian wymagań na zakończonej karcie; A08 — testy behawioralne zamiast ogłoszeń RED/GREEN; A10 — normalizacja CRLF. Kruchy locator jakości sieci w teście dwóch sesji poprawić tak, aby asercja dotyczyła stanu kolejki; nie uznawać tego failure za dowód uszkodzenia zdjęć.

### C. Dług techniczny i ryzyka wymagające potwierdzenia

Pozostałe mutable search_path, nadmiarowe EXECUTE dla anon, frontendowe role fallback, brak kompletnego manifestu rebuild, brak planu retencji tombstone (nie wolno po prostu usuwać historii i umożliwić resurrection), globalne localStorage prób oraz źródłowe smoke testy. Publiczny bucket WaWis wymaga inwentaryzacji zawartości. Nie wykazano eksploatacji tych ostrzeżeń ani nieograniczonego retry/request storm. Wywołania MessageChannel i IndexedDB upgrade/versionchange wymagają dłuższego testu zasobów; brak takiego testu nie jest sam w sobie dowodem memory leak.

Nie uznaję powielonych modułów desktop/mobile i warstw CSS automatycznie za błędy. Brak niezależnego inventory martwego kodu opartego o runtime/bundle coverage; nie proponuję kasowania plików na podstawie samej nazwy wersji.

### D. Małe grupy napraw, RED → GREEN

| Grupa | RED do zachowania | Minimalny zakres | GREEN i kontrola regresji |
|---|---|---|---|
| Kontakt | A01 fixture HQ/Branch/stary telefon | Jeden trigger/RPC i jawny patch pól | Zachowanie pozostałych pól i adresów; admin/worker/direct REST; zmiana contractor_id |
| Lifecycle PUSH | A03 SQL+SW i historyczny guard | Model tożsamości kontekstu vs endpoint | Nowy endpoint działa; stare A sync/clear/410 nie zmieniają B |
| E-mail | A04 dwa protokoły + 25 h lost response | Rejestr prób i serwerowy stan niepewny | Jedno dostarczenie; timeout body; replacement nie zmienia payloadu tej samej próby |
| SMS | A05 bariera READ/UPDATE | Atomowy RPC/status CAS | Obie kolejności callbacków, retry po częściowym błędzie, nowa wysyłka w jobs |
| Paliwo | A06 A→B i dwie karty | Owner namespace, trwały operation ID, warunkowy cleanup | Obcy draft niewidoczny; jeden INSERT na retry; osobne tankowania nie scalane |
| Backend rebuild/restore | A07 brak DDL; A09 restore przed photos | Dodać brakujące baseline; restore transakcyjne z końcową walidacją | Fresh rebuild bez ręcznych operacji, ponowny replay, pełny restore Storage i katalog |
| Loadery | A11 OLD po NEW | Request/session token bez przepisywania paneli | Resolve/reject/unmount/logout nie nadpisują nowszego UI/cache/error/loading |
| Dowody release | A08 i A10 | Wykonywalne regresje + portable odczyty | Rzeczywisty historyczny RED; aktualny GREEN; test negatywny uruchomienia; LF/CRLF |

## 8. Odpowiedź końcowa

**RED — nie rozwijać dalej bez zamknięcia potwierdzonych P1.** Najmocniejszy powód to rzeczywiste nadpisanie danych kontaktowych przez poprawkę 10.89 oraz błędy odtwarzania i lifecycle. Zielony build i większość E2E nie obalają tych kontrprzykładów; obecne testy ich nie wykonują.

**Czy obecna architektura nadaje się do dalszego rozwoju? TAK, ALE dopiero po tych małych naprawach.** Nie ma podstaw do przepisywania całej aplikacji. Trzeba rozszerzyć ochronę z pojedynczych funkcji na ich rzeczywiste połączenia: trigger↔restore, DB generation↔SW, durable attempt↔konto↔provider. Niewykonane scenariusze pozostają jawnie nieweryfikowane, nawet gdy kod wygląda prawidłowo.

[s01]: https://github.com/wawis-klima/wawis/blob/ab3a3ad5eb2a3b346800307370f136e5d8b52c43/supabase/migrations/20260917065004_n7_v1089_worker_contractor_contact_update.sql#L21
[s02]: https://github.com/wawis-klima/wawis/blob/ab3a3ad5eb2a3b346800307370f136e5d8b52c43/supabase/migrations/20260916201000_job_completion_nameplate_guard_v1088.sql#L147
[s03]: https://github.com/wawis-klima/wawis/blob/ab3a3ad5eb2a3b346800307370f136e5d8b52c43/public/push-context-guard.js#L28
[s04]: https://github.com/wawis-klima/wawis/blob/ab3a3ad5eb2a3b346800307370f136e5d8b52c43/public/push-sw.js#L77
[s05]: https://github.com/wawis-klima/wawis/blob/ab3a3ad5eb2a3b346800307370f136e5d8b52c43/src/mobile791/modules/job-protocol-email.js#L69
[s06]: https://github.com/wawis-klima/wawis/blob/ab3a3ad5eb2a3b346800307370f136e5d8b52c43/supabase/functions/send-job-protocol-email/index.ts#L108
[s07]: https://github.com/wawis-klima/wawis/blob/ab3a3ad5eb2a3b346800307370f136e5d8b52c43/supabase/functions/smsapi-delivery-webhook/index.ts#L84
[s08]: https://github.com/wawis-klima/wawis/blob/ab3a3ad5eb2a3b346800307370f136e5d8b52c43/src/components/fuel/FuelPanelBase.jsx#L27
[s09]: https://github.com/wawis-klima/wawis/blob/ab3a3ad5eb2a3b346800307370f136e5d8b52c43/supabase/rebuild/20260917050029_n7_v1089_triggers_baseline.sql#L29
[s10]: https://github.com/wawis-klima/wawis/blob/ab3a3ad5eb2a3b346800307370f136e5d8b52c43/supabase/rebuild/20260917050129_n7_v1089_storage_baseline.sql#L28
[s11]: https://github.com/wawis-klima/wawis/blob/ab3a3ad5eb2a3b346800307370f136e5d8b52c43/supabase/rebuild/20260917050212_n7_v1089_acl_grants_baseline.sql#L43
[s12]: https://github.com/wawis-klima/wawis/blob/ab3a3ad5eb2a3b346800307370f136e5d8b52c43/scripts/smoke-audit-fixes-v1088.mjs#L12
[s13]: https://github.com/wawis-klima/wawis/blob/ab3a3ad5eb2a3b346800307370f136e5d8b52c43/scripts/smoke-audit-fixes-v1086.mjs#L13
[s14]: https://github.com/wawis-klima/wawis/blob/ab3a3ad5eb2a3b346800307370f136e5d8b52c43/src/components/devices/DevicesPanel.jsx#L286