**WAWIS 13.41 — końcowy niezależny audyt bezpieczeństwa zdjęć**

Data: 21 października 2026. Repozytorium: wawis-klima/wawis. PR: [#380](https://github.com/wawis-klima/wawis/pull/380).

Badany commit: f64b512ed17df43d529262b57c4bc48af23d61c8, porównany z 13.40: 76e0e188820014204fb434cf8b87173c8a439900. Testy wykonano na osobnych kopiach tych wersji. Drzewo plików commita produkcyjnego jest identyczne z drzewem przetestowanego PR head e042de669fd97e6dec1970d0ceb8de3f7a251d09: efa721d9e5920f7207f4d9cc0125eb1d8af8cc17.

**Ocena końcowa: FAIL.** Poprawki usuwają pięć pierwotnych awarii w ich pierwotnych reproduktorach, ale nie zamykają całego problemu bezpieczeństwa. Odtworzyłem dwa dodatkowe scenariusze P0 w kontrolowanym środowisku: usunięcie trwałej kopii na podstawie cache HTTP oraz usunięcie jej przez równolegle działający klient 13.40. Odtworzyłem także błędy przejęcia lease, ponawiania i prezentacji nieudanego zapisu lokalnego.

To wynik audytu kodu i reprodukcji. Nie jest stwierdzeniem, że wymienione incydenty wystąpiły u klientów. Nie wykonywałem zapisów w produkcyjnym Supabase, wdrożeń, commitów ani zmian kodu aplikacji lub jej testów. Nowe reproduktory i wyniki znajdują się poza repozytorium.

**1. Zakres dowodów i wyniki**

| Weryfikacja | Wynik | Znaczenie |
| --- | --- | --- |
| Cały niezmieniony zestaw Playwright, 125 pozycji | 121 PASS, 3 FAIL, 1 SKIP | Mobile: 101 PASS, 3 FAIL, 1 SKIP; desktop: 20 PASS. |
| 23 testy zdjęć/odporności, po 3 wykonania | 69 PASS | Realny IndexedDB i kod aplikacji; transport Supabase zastąpiony adapterami. |
| Grupy photos, nameplates, protocol | 48/48 poleceń PASS | Mieszanka kontroli statycznych i wykonywalnych; nie zastępuje integracji Storage/RLS. |
| Cztery zestawy oryginalnych reproduktorów, obejmujące pięć poprzednich ustaleń | 13.40: cztery zestawy RED; 13.41: cztery GREEN | Zachowano oczekiwania bezpieczeństwa; nie obniżano asercji. |
| Publiczne ręczne retry podczas pracy innego workera | 3/3 naruszenia niezmiennika | Drugi proces używa tokenu pierwszego i zmienia jego stan. |
| Spóźniony worker po utracie generacji | Nadal wykonuje upload | Nowa generacja w IDB zachowana, ale stary proces nie przerywa działań sieciowych. |
| Restart persistent Chromium + aktualizacja 13.40 → 13.41 na tym samym origin | PASS | Dwa pliki zachowane bajt w bajt, następnie dwa obiekty i dwa rekordy, kolejka pusta. |
| Starsze schematy IndexedDB v1 i v2 | PASS odczytu i hydratacji | Zachowane bajty przykładowego starego rekordu. |
| Równoległe moduły 13.40 i 13.41, jeden origin/IDB | RED | Stary klient kasuje rekord nowego workera przy braku obiektu zdalnego. |
| Prawdziwy cache HTTP Chromium + SDK Supabase + moduły 13.41 | RED | Weryfikacja używa cache; lokalny rekord znika mimo 404 z origin. |
| Kontrolowany błąd QuotaExceededError | RED spójności stanu | IDB: 0 rekordów; UI: „Zapisano na telefonie”; retry nie zapisuje i nie wysyła pliku. |

Pełny Playwright uruchomiono w Node 22 i Chromium systemowym 154, z Vite w trybie mock. Repozytorium używa Playwright 1.60.0; jego standardowa przeglądarka Chromium różni się od systemowej. To ogranicza porównywanie zachowania czasowego z CI. Żaden z tych wyników nie jest testem Safari na fizycznym iPhonie ani produkcyjnych polityk RLS.

Pierwsze uruchomienie grup zatrzymało się na brakującym historycznym obiekcie Git wymaganym przez smoke-audit-fixes-v1088.mjs. Pobrałem wyłącznie ten obiekt do tymczasowego checkoutu i ponowiłem wymagane grupy: 48/48 PASS. Pierwotny błąd środowiska zachowano w grouped-checks-shallow.json/log.

Dowody: [pełny Playwright](full-report.json), [69 wykonań](repeated-photo-report.json), [48 poleceń](grouped-checks.json), [RED/GREEN oryginalnych reproduktorów](original-invariants/summary.json), [restart i upgrade](restart-upgrade-results.json).

**2. Weryfikacja pięciu poprzednich problemów**

| Problem | Rzeczywista zmiana i reprodukcja | Ocena |
| --- | --- | --- |
| P0-R1: usunięcie bez potwierdzenia zawartości Storage | photos.js:808 pobiera obiekt i porównuje rozmiar oraz SHA-256; :911 i :1198 chronią reconciliation i finał uploadu. Brak obiektu, inne bajty oraz legacy z niezgodnymi bajtami zachowują File; zgodny plik pozwala usunąć lokalny rekord. | Pierwotna awaria naprawiona. Całość NIEZAMKNIĘTA z powodu cache opisanego jako P0-N1. |
| P0-R2: kolizja dwóch różnych zdjęć | photos.js:535 usuwa fallback oparty na metadanych; :557 nadaje nonce przy braku odczytu/hashowania. photo-offline-queue.js:123 używa add i nie podmienia istniejącego File. Dwa różne prawidłowe PNG o tej samej nazwie, wielkości i czasie, z błędem arrayBuffer, pozostają osobnymi rekordami. | PASS pierwotnego scenariusza. |
| P1-C1: nadpisanie kolejki między użytkownikami | photos.js:569 dodaje uploaderId do tożsamości; hook przekazuje go w useSelectedJobActions.js:522. Kolejka sprawdza właściciela w :139. Rzeczywiste publiczne dodanie tego samego pliku przez A i B daje dwa ID i obu właścicieli. | PASS pierwotnego scenariusza. |
| P1-C2: automatyczne retry 403 | photos.js:474 traktuje 401/403 jako trwałe; runPersistedPhotoUploads w :1722 używa stanu sprzed claim. Oryginalne dwa wznowienia: zero uploadów. Dodatkowo rzeczywisty upload kończący się 403 i trzy kolejne wznowienia: nadal tylko jedna pierwotna próba, File zachowany. | PASS pierwotnego scenariusza. Błędy weryfikacji mają odrębny problem P1-N2. |
| P1-C3: spóźniony worker | update/delete/release sprawdzają owner i attempt_generation; recovery dodatkowo lease_until. Pierwotny spóźniony A po przejęciu przez B nie zmienia ani nie usuwa rekordu B. | Częściowo: GREEN pierwotnej sekwencji, ale publiczne retry pożycza cudzy token; mieszane wersje omijają nowe zabezpieczenia. |

Weryfikacja SHA-256 obejmuje wersję przeznaczoną do uploadu, po ewentualnej kompresji. Nie potwierdza archiwizacji oryginału z aparatu w jego pierwotnej rozdzielczości.

Dokładne źródła: [weryfikacja bajtów](/tmp/wawis-1341-audit/src/mobile791/modules/photos.js:808), [tożsamość](/tmp/wawis-1341-audit/src/mobile791/modules/photos.js:557), [niezmienny zapis](/tmp/wawis-1341-audit/src/mobile791/modules/photo-offline-queue.js:123), [CAS aktualizacji](/tmp/wawis-1341-audit/src/mobile791/modules/photo-offline-queue.js:166), [CAS usunięcia](/tmp/wawis-1341-audit/src/mobile791/modules/photo-offline-queue.js:207).

**3. Potwierdzone problemy P0**

**P0-N1 — SHA-256 starego obiektu z cache może autoryzować usunięcie trwałego File.**

- Miejsce: [photos.js:812](/tmp/wawis-1341-audit/src/mobile791/modules/photos.js:812), a następnie usunięcia w :926 i :1223. Upload ustawia cacheControl: '3600' w :1111. Weryfikacja wykonuje download(storagePath) bez wymuszenia świeżego odczytu.
- Przyczyna: zgodność bajtów otrzymanych z cache nie dowodzi aktualnej obecności obiektu w Storage. SDK i przeglądarka mogą obsłużyć GET z ważnego prywatnego cache. Porównanie SHA-256 jest wtedy poprawne matematycznie, ale dotyczy starej odpowiedzi.
- Reprodukcja: prawdziwy lokalny serwer HTTP zwraca plik z Cache-Control: private, max-age=3600. Rzeczywisty kod 13.41 wykonuje restore przy zajętym lease: pobiera i weryfikuje plik, lecz zachowuje IDB. Następnie lease zostaje zwolniony, serwer traci obiekt, a kolejne restore dostaje stare bajty z cache i kasuje rekord. Żądanie SDK z cacheNonce i cache: no-store zwraca 404. Po usunięciu cache przeglądarki i reload IDB nadal ma zero rekordów, a origin zwraca 404.
- Dowód: [wynik](http-cache-results.json), [reproduktor](probe-http-cache.mjs). Użyto rzeczywistego cache Chromium, SDK Supabase i funkcji aplikacji; odpowiedzi Storage pochodziły z kontrolowanego serwera HTTP. Nie korzystano z page.route, które wyłączyłoby cache.
- Konsekwencje: znika zarządzana, trwała kopia lokalna mimo braku pliku zdalnego. Zdjęcie może jeszcze istnieć w cache, ale po jego usunięciu/wygaśnięciu pozostaje sam rekord photos.
- Rozwiązanie: weryfikację integralności wykonywać przez świeże pobranie z pominięciem cache, np. wspierane przez obecne SDK download(path, { cacheNonce: unikalnyIdPróby }, { cache: 'no-store' }). Zbadać również cache pośredni/CDN; dowód nie może pochodzić ze starej odpowiedzi. Zachować sprawdzanie rozmiaru i pełnego SHA-256. Sam signed URL, HEAD lub rozmiar nie zastępuje tego dowodu.
- Test regresyjny: dokładna powyższa sekwencja z prawdziwym HTTP cache, kolejno obiekt obecny → pierwszy restore przy cudzym lease → obiekt usunięty → drugi restore → cache eviction/reload. Wymagane IDB=1 i zachowane oryginalne bajty. Osobno kontrola pozytywna dla świeżych zgodnych bajtów. Powtórzyć na izolowanym Supabase z jego rzeczywistymi nagłówkami cache.
- Ryzyko zmiany: większy transfer i czas weryfikacji, zwłaszcza przy wielokrotnym restore. Optymalizacja P2-N1 musi respektować świeżość dowodu.
- Granica dowodu: nie odczytałem nagłówków produkcyjnego Storage. Mechanizm jest potwierdzony dla wskazanej polityki cache; występowanie takiej odpowiedzi w produkcji jest NOT VERIFIED.

**P0-N2 — współistnienie 13.40 i 13.41 pozwala staremu workerowi skasować plik nowego.**

- Miejsce: [photo-offline-queue.js:2](/tmp/wawis-1341-audit/src/mobile791/modules/photo-offline-queue.js:2): te same DB_NAME, DB_VERSION=3 i object store. W 13.40 [deletePhotoQueueItem:163](/tmp/wawis-1340-audit/src/mobile791/modules/photo-offline-queue.js:163) wykonuje bezwarunkowe store.delete. W 13.41 nowa kontrola chroni tylko kod, który ją wywołuje.
- Przyczyna: wdrożenie nowego kodu nie odbiera już działającemu staremu JavaScriptowi prawa zapisu do wspólnego IndexedDB. Zapisany w rekordzie owner/generation nie jest ograniczeniem narzuconym przez silnik bazy. Stara funkcja go nie sprawdza.
- Reprodukcja: dwie strony jednego origin i jednego rzeczywistego IDB, jedna ładuje niezmienione moduły 13.40, druga 13.41. A zaczyna upload i czeka na odpowiedź. Po kontrolowanym upływie lease rzeczywisty worker B z 13.41 przejmuje ten sam rekord i czeka na własny upload. Spóźniony A otrzymuje ACK i rekord photos, bez obiektu w kontrolowanym Storage. Kod 13.40 usuwa kolejkę pomimo aktywnego B. B następnie otrzymuje błąd uploadu. Stan końcowy: queue=0, server objects=0, jeden rekord metadanych.
- Dowód: [wynik](mixed-versions-results.json), [reproduktor z asercją RED](probe-mixed-versions.mjs). Przed odpowiedzią A rekord B miał 119 B, własny owner, generation=1 i status uploading; po A zniknął.
- Konsekwencje: utrata ostatniej trwałej kopii w okresie przechodzenia między wersjami. To odrębny scenariusz od restartu, w którym stary proces został najpierw zamknięty.
- Dlaczego auto-update nie zamyka tematu: [AppModal.jsx:125](/tmp/wawis-1341-audit/src/mobile791/components/modals/AppModal.jsx:125) blokuje reload otwartego formularza, a [update-reload-guard.js:141](/tmp/wawis-1341-audit/src/modules/update-reload-guard.js:141) odkłada przeładowanie. Nie ma globalnej atomowej bariery wersji kolejki. Nie odtworzono natywnej aktualizacji PWA; potwierdzono zachowanie równolegle działających wersji kodu.
- Rozwiązanie: wprowadzić barierę wersji magazynu, np. podnieść DB_VERSION do 4 z niedestrukcyjnym zachowaniem rekordów. Po udanym upgrade stare open(...,3) musi kończyć się VersionError, dzięki czemu stary kod nie może ponownie otworzyć bazy i usunąć rekordu. Zaprojektować onblocked/versionchange, zatrzymanie starego workera oraz komunikat aktualizacji; wszystkie moduły używające kolejki muszą respektować nową wersję. Alternatywą jest nowy magazyn z atomowym, niedestrukcyjnym kopiowaniem danych i izolacją starych zapisów. Nie usuwać starych plików jako sposobu migracji.
- Test regresyjny: powyższy test dwóch rzeczywistych wersji, oba kierunki opóźnionych odpowiedzi success/error, upgrade podczas sieciowego await i podczas transakcji. Po przejęciu przez nową wersję stary DELETE/PUT musi być nieskuteczny, nowy Blob zachowany. Dodać v1/v2/v3 → nowa wersja i ścieżkę blocked upgrade.
- Ryzyko zmiany: migracja może zatrzymać synchronizację w starych kartach; wymaga jasnego komunikatu i obsługi zablokowanego upgrade. Bariera zaczyna chronić po skutecznym upgrade; nie odzyska danych skasowanych wcześniej przez starą wersję.

**4. Potwierdzone problemy P1**

**P1-N1 — publiczne „Ponów” pożycza lease innego procesu; stary worker ignoruje odrzucenie CAS.**

- Miejsce: [photos.js:1807](/tmp/wawis-1341-audit/src/mobile791/modules/photos.js:1807) odczytuje rekord; hydrate zachowuje lease_owner w [photo-offline-queue.js:423](/tmp/wawis-1341-audit/src/mobile791/modules/photo-offline-queue.js:423). [photos.js:1285](/tmp/wawis-1341-audit/src/mobile791/modules/photos.js:1285) uznaje samą obecność ownera za własne przejęcie. Zwracane false z aktualizacji w :1050, :1106 i :1115 nie zatrzymuje procesu.
- Reprodukcja A: A ma aktywny upload. B wywołuje publiczne retryQueuedJobPhoto na tej samej pozycji. B odczytuje owner/generation A i uruchamia drugi upload. Jego 403 ustawia status error oraz pusty lease_until pod tokenem A. Reprodukcja 3/3. Oryginalny File zachowany.
- Reprodukcja B: A czeka na getUser, jego lease wygasa, B dostaje generation=2. Odpowiedź auth odblokowuje A; CAS aktualizacji jest odrzucony, lecz A mimo to wykonuje upload. Stan B pozostaje chroniony, ale wyłączność działań sieciowych jest naruszona.
- Dowody: [trzy powtórzenia](manual-race-results.json), [RED](manual-race.log), [stary proces po utracie generacji](stale-network-results.json), [kod reproduktora](probe-stale-network.mjs).
- Konsekwencje: równoległe próby, błędne statusy, skasowanie aktywnej dzierżawy i dodatkowe konflikty Storage. Nie odtworzyłem utraty już zapisanego Blob w scenariuszu dwóch klientów wyłącznie 13.41.
- Rozwiązanie: retry z UI zawsze musi uzyskać własny claim; aktywne cudze przejęcie oznacza brak nowego uploadu. Oddzielić wewnętrzne przekazanie claim uzyskanego przez bieżące wywołanie od danych odczytanych z IDB. Sam lease_owner z hydratacji nie może być przepustką. Każde odrzucone CAS musi natychmiast przerwać stary proces przed kolejnym skutkiem ubocznym i aktualizacją UI. Utrzymać immutable path, upsert:false i serwerową unikalność.
- Test regresyjny: publiczne retry przy aktywnym A: B uploads=0, owner/generation/lease A bez zmian. Sekwencja A→B→C oraz spóźnione błędy i sukcesy. Przejęcie w trakcie auth/kompresji: stary worker nie zaczyna późniejszego uploadu/INSERT. Dotychczasowy test prymitywów CAS nie wystarcza.
- Ryzyko: przycisk retry czasem pokaże „już wysyłane”; należy zadbać o odświeżenie UI po cudzej próbie. Fencing nadal musi działać przy uśpieniu procesu iPhone'a.

**P1-N2 — 503/429 podczas dowodzenia integralności po 409 może trwale zatrzymać kolejkę.**

- Miejsce: [photos.js:813](/tmp/wawis-1341-audit/src/mobile791/modules/photos.js:813) redukuje błąd do false, :1124 zastępuje go ogólnym Error, :1243 klasyfikuje retry. Status transportowy zostaje utracony.
- Reprodukcja: obiekt istnieje, rekordu photos jeszcze nie ma; upload zwraca 409. Pierwszy download ma 503, kolejne byłyby poprawne. W IDB pozostaje error, next_attempt_at pusty, metadata rows=0. Trzy automatyczne wznowienia nie wykonują kolejnej próby. Ręczne retry kończy poprawnie. Analogiczny wynik dla 429. Przetestowano też 403 i 404 w tej fazie.
- Dowód: [503](additional-results.json), [macierz statusów](status-matrix-results.json). Kontrola: 503/429 bezpośrednio z uploadu daje backoff i poprawne automatyczne wznowienie. Po udanym INSERT i późniejszym 503 odczytu kolejny odczyt metadanych potrafi uzgodnić rekord; problemu nie należy uogólniać na wszystkie 503.
- Konsekwencje: zdjęcie pozostaje lokalne, monter musi ręcznie wznowić wysyłanie mimo ustąpienia przejściowego błędu. Moduły zależne od serwerowej tabliczki mogą pozostać zablokowane.
- Rozwiązanie: wynik weryfikacji powinien rozróżniać zgodność, niezgodność hash, brak obiektu, brak uprawnień, awarię przejściową i brak obsługi kryptografii. Zachować oryginalny status/cause. Timeout/network/429/503 kierować do backoff; 403 do stanu wymagającego interwencji; mismatch do trwałego konfliktu z zachowaniem File. Dla 404 określić ograniczoną politykę weryfikacji/naprawy, bez uznawania pliku za przesłany.
- Test regresyjny: 409 → download503/429 → automatyczne ticki z upływem backoff → zgodny świeży obiekt → jeden rekord photos, jeden obiekt i pusta kolejka. Kontrole 403 i mismatch nigdy nie kasują lokalnego pliku ani nie tworzą pętli retry.
- Ryzyko: zbyt szeroki retry zwiększy transfer; trwały mismatch i 403 muszą pozostać odróżnialne od awarii przejściowej.

**P1-N3 — nieudany zapis IndexedDB pozostawia fałszywy status trwałego zapisu i nieskuteczne retry.**

- Miejsce: [photos.js:1513](/tmp/wawis-1341-audit/src/mobile791/modules/photos.js:1513) wstawia zdjęcie do UI przed save; :1518–1521 zwraca failedCount bez skorygowania tej pozycji. Status „Zapisano na telefonie” powstaje w :727. Retry w :1286 wymaga istniejącego rekordu. Dodatkowo [useSelectedJobActions.js:601](/tmp/wawis-1341-audit/src/mobile791/hooks/useSelectedJobActions.js:601) zamyka zwykły formularz przed komunikatem o failedCount w :605.
- Reprodukcja: wymuszony QuotaExceededError wyłącznie przy add do kolejki, rzeczywiste IDB i uploadJobDocumentationPhotos. Wynik helpera: failedCount=1, queuedCount=0. UI nadal ma jedną pozycję local z etykietą „Zapisano na telefonie”, IDB=0. Publiczne retry zwraca accepted=true, lecz uploads=0 i IDB=0. Po reload nadal brak rekordu. File pozostawał jedynie w pamięci strony.
- Dowód: [wynik](persistence-failure-results.json), [reproduktor](probe-persistence-failure.mjs).
- Konsekwencje: możliwa utrata nieutrwalonego zdjęcia przy reload/ubiciu PWA oraz myląca informacja o bezpieczeństwie kopii. Helper raportuje failedCount, a część wywołujących pokazuje błąd; nie twierdzę, że każda ścieżka UI milcząco zgłasza sukces. Ścieżka serialOnlyMode może pozostawić formularz otwarty.
- Rozwiązanie: status durable-local nadawać dopiero po commit transakcji IDB. Po błędzie zachować pending File i formularz oraz pokazać „Nie zapisano w pamięci telefonu”; nie resetować stanu formularza z failedCount. Retry pozycji nieutrwalonej musi najpierw ponowić trwały zapis i sprawdzić jego wynik. Obsłużyć również odrzucenie openQueueDb, które w save jest obecnie przed try. Nie usuwać plików kolejki w celu odzyskania miejsca.
- Test regresyjny: błąd add/abort/open, częściowo pełna paczka JW/JZ, przywrócenie możliwości zapisu → retry → reload z zachowanymi bajtami → upload. UI nigdy nie deklaruje trwałego zapisu przy IDB=0. Test całego kreatora zarówno pracownika, jak administratora, w obu trybach.
- Ryzyko: formularz pozostanie otwarty przy braku miejsca; potrzebne jasne rozróżnienie kopii w RAM i trwałej. Nie jest to dowód usunięcia wcześniej skutecznie zapisanego Blob przez samą wersję 13.41.

**5. P2 — wydajność i wiarygodność testów**

**P2-N1 — powtórne pełne odczyty i hashowanie zdjęć.**

Miejsca: [photos.js:812](/tmp/wawis-1341-audit/src/mobile791/modules/photos.js:812), :814, :1123, :1198 oraz :1618 przed pozyskaniem claim w :918. Pole upload_stage nie warunkuje samego wywołania upload w :1109, mimo komentarza o pomijaniu zakończonego etapu w :1182.

Potwierdzono: zwykły upload → jeden pełny download do dowodu; 409 przy braku metadata → dwa dowody/downloady; dwa restore dla trzech plików po 2 MiB z aktywnymi cudzymi lease → sześć odczytów i przetworzenie 12 MiB danych, bez zmiany trzech rekordów kolejki. Syntetyczny adapter z opóźnieniem 100 ms dał około 916 ms. Nie jest to benchmark iPhone'a ani pomiar rzeczywistego transferu Supabase. HTTP cache może obsłużyć część odczytów lokalnie, co wiąże się z P0-N1.

Konsekwencje: dodatkowy transfer na pierwszej świeżej weryfikacji, obciążenie CPU i pamięci dla dwóch arrayBuffer, dłuższy stan zapisu i większa presja na limity pamięci iPhone'a. Nazwy tabliczek/idempotencja nie eliminują tego kosztu.

Rozwiązanie: odrzucać aktywny cudzy claim przed kosztowną weryfikacją; scalać identyczne równoległe weryfikacje w obrębie jednej aktualnej próby; po przejęciu świadomie kontynuować etap Storage bez powtórnego PUT, pod warunkiem świeżego dowodu zgodnych bajtów. Ewentualny dowód współdzielony musi wiązać path, digest, rozmiar, wersję obiektu i generację próby. Nie zastępować SHA potwierdzeniem samej ścieżki ani długotrwałym cache zaufania. Rozważyć hashowanie poza głównym wątkiem po pomiarach.

Test: licznik żądań i bajtów przy normalnym uploadzie, 409, wznowieniu po INSERT failure i wielokrotnym restore; limit szczytowej pamięci i opóźnień na fizycznym iPhonie dla zdjęć o rzeczywistych rozmiarach. Ryzyko: nadmierna optymalizacja dowodu może odtworzyć P0-R1; najpierw naprawić świeżość i lease.

**P2-N2 — test OCR połyka błąd niejednoznacznego selektora.**

Miejsce: [mobile-serial-scanner.spec.js:552](/tmp/wawis-1341-audit/tests/e2e/mobile-serial-scanner.spec.js:552). Selektor nameplateVerifyWarning trafia w dwa poprawnie wyświetlone ostrzeżenia. isVisible zgłasza strict mode violation; catch zamienia je na false. Następna asercja zgłasza brak oczekiwanej informacji mimo widocznych ostrzeżeń.

Dowód: [wyjątek z trace](ocr-strict-error.json), [pełny raport](full-report.json). Model został rozpoznany; problem występuje w gałęzi braku automatycznego SN/AI. Test i badana logika OCR nie zmieniły się między 13.40 a 13.41, a ten sam błąd był wykazany w poprzednim audycie. Nie klasyfikuję go jako nowej regresji aplikacji.

Rozwiązanie: zawęzić locator do właściwego dialogu i semantycznego ostrzeżenia; jawnie dopuszczać wiele komunikatów, jeżeli tak działa UI. Nie zamieniać wyjątku selektora w wynik biznesowy false. Rozdzielić deterministyczny test automatycznego SN i test braku AI/ręcznego potwierdzenia. Zachować blokadę Potwierdź, kontrolę SN względem EAN i sprawdzenie zapisanego rekordu.

Test: AI sukces, AI niedostępne z jednym ostrzeżeniem i z dwoma ostrzeżeniami, błędny EAN w polu SN, ręczne potwierdzenie. Ryzyko: naprawa testu nie może osłabić wymogu poprawnego numeru.

**P2-N3 — testy animacji zależą od czasu obserwacji, a „mobile” nie oznacza Safari.**

Miejsca: [mobile-v1308-motion.spec.js:31](/tmp/wawis-1341-audit/tests/e2e/mobile-v1308-motion.spec.js:31) i :35 oraz [mobile-v1309-inline-card-motion.spec.js:28](/tmp/wawis-1341-audit/tests/e2e/mobile-v1309-inline-card-motion.spec.js:28). Po click, asercjach i stałym waitForTimeout test mierzy rzekomo pośrednią wysokość; animacja może już być zakończona. W pełnym przebiegu środkowa i końcowa wysokość były równe. Izolowane powtórzenia 13.41: 2 PASS, 4 FAIL. W 13.40 te same przypadki: 0 PASS, 4 FAIL. Źródła tych testów i animacji nie są zmienione w PR #380. Dowody nie wskazują nowej regresji spowodowanej poprawkami zdjęć.

Rozwiązanie: obserwować transitionrun/transitionend lub Animations API przed kliknięciem, zebrać próbki requestAnimationFrame w przeglądarce i asercje odnieść do czasu samej animacji. Oddzielnie sprawdzać końcowy stan i reduced-motion. Nie zwiększać samych timeoutów ani nie usuwać kontroli animacji.

Konfiguracja uruchamia Chromium. Wiele plików pobiera profil iPhone 14 i usuwa defaultBrowserType. [mobile-v1092-full-layout.spec.js:45](/tmp/wawis-1341-audit/tests/e2e/mobile-v1092-full-layout.spec.js:45) jawnie pomija jedyny wskazany test WebKit w Chromium. Dodać oddzielny job WebKit oraz test fizycznej PWA. Test potwierdzenia bezpieczeństwa musi raportować silnik, skipy i transport; zielony mobile Chromium nie potwierdza specyfiki IndexedDB/iOS.

Test regresyjny tej poprawy: stabilne wykonania testów animacji przy kontrolowanym obciążeniu bez osłabienia asercji oraz osobno uruchomione WebKit. Ryzyko: różnice silników wymagają pomiaru właściwego mechanizmu, a nie dowolnego tolerowania błędów.

**6. Cała droga zdjęcia i wszystkie miejsca usunięcia/utraty**

| Etap | Ustalenie |
| --- | --- |
| Aparat/kadrowanie/formularz | File pozostaje w stanie strony do trwałego zapisu. Nie potwierdzono odporności tego okresu na ubicie iOS. P1-N3 pokazuje konkretny błąd przy odrzuceniu zapisu. |
| Tożsamość | SHA pliku i właściciel; przy read error nonce, bez deduplikacji po metadanych. Błąd odczytu nie podmienia drugiego pliku. |
| savePhotoQueueItem | add zamiast nadpisania; przy istniejącym PK zachowuje dotychczasowy Blob i lease. Brak ogólnej operacji clear/deleteDatabase w zbadanej ścieżce zdjęć. |
| Przygotowanie/kompresja | Oryginalny local_file i prepared_file są odrębnymi polami. Przygotowany plik zostaje utrwalony przed uploadem. Odrzucane CAS musi zatrzymywać proces — P1-N1. |
| Upload | upsert:false i stabilna ścieżka chronią przed nadpisaniem obiektu; 409 wymaga dowodu zgodnych bajtów. Niezgodne bajty zachowują File. |
| INSERT photos | Następuje po uploadzie; Storage i PostgreSQL nie tworzą jednej transakcji. Niepowodzenie może zostawić obiekt bez row. Kolejka ma służyć dokończeniu, ale P1-N2 może je zatrzymać. |
| Automatyczne usunięcie po uzgodnieniu | photos.js:926; wymaga path, bajtów i guarded DELETE. Zagrożenie świeżości dowodu P0-N1. |
| Automatyczne usunięcie po uploadzie | photos.js:1223; wymaga dowodu i guarded DELETE. Te same ograniczenia cache/wersji. |
| Ręczne usunięcie lokalnego zdjęcia | photos.js:1333: potwierdzenie użytkownika, brak usunięcia przy aktywnym uploading i sprawdzenie wyniku DELETE. Świadome usunięcie nie jest automatycznym dowodem uploadu. |
| Odrzucenie w Centrum synchronizacji | App.jsx:1086: osobne potwierdzenie i sprawdzenie wyniku DELETE. Chroni przed aktualnym aktywnym lease. |
| Stary kod | 13.40 deletePhotoQueueItem:163 omija nowe warunki — P0-N2. |
| Usunięcie zdalne | deleteJobPhoto i administracyjne operacje urządzeń/montaży są odrębnymi, autoryzowanymi działaniami. Wykonano testy mock współpracy modułów; produkcyjne prawa DELETE i aktywne migracje nie były wykonywane ani zmieniane. |
| Utrata storage przeglądarki | Wyczyszczenie danych, eviction i awaria urządzenia nie są zabezpieczone samym IndexedDB. Brak testu fizycznego iPhone'a; nie zgłaszam ich jako zaobserwowanego incydentu. |

Wyłączenie Web Crypto zostało przetestowane: plik otrzymuje osobną tożsamość, może dotrzeć do Storage i photos, ale nie zostaje usunięty lokalnie, bo dowód SHA jest niemożliwy. Pozostaje error z komunikatem ponownej weryfikacji. To bezpieczna odmowa usunięcia, lecz może utrudniać pracę. Zalecam osobny stan i jasny komunikat o braku obsługi, z testem odzyskania możliwości kryptograficznych po ponownym uruchomieniu.

Nie odtworzyłem duplikowania obiektów w prawidłowych ścieżkach 13.41: powtarzane próby używają tej samej ścieżki i upsert:false. Źródłowy rebuild definiuje unikalny niepusty photos.storage_path w supabase/rebuild/20260917050006_n7_v1089_indexes_baseline.sql:132. Obecność tego indeksu w produkcji pozostaje NOT VERIFIED. Naprawa owner scope celowo dopuszcza dwa obiekty dla tego samego zdjęcia dodanego przez dwóch różnych użytkowników; to odrębne operacje, nie nadpisanie danych.

**7. Supabase, synchronizacja, RLS i GitHub Actions**

PR #380 nie zmienia schematu Supabase ani RLS. Pobieranie do dowodu zwiększa zależność od prawa SELECT obiektów. Repozytorium zawiera politykę job_photos_storage_select_accessible_job w supabase/migrations/20260911133000_worker_read_all_jobs_v1060.sql:61, opartą na current_user_can_view_job. To dowód intencji migracji; nie potwierdza stanu aktywnego backendu. Dodatkowy odczyt 403 musi zachować lokalną kopię i jasno wskazać brak dostępu.

Mobilny klient produkcyjny używa timedSupabaseFetch; request-timeout.js obejmuje również odczyt body i ustawia 30 s dla Storage, 45 s dla zwykłych żądań i 12 s dla auth. Nie zgłaszam nieograniczonego downloadu jako potwierdzonego błędu. Uśpienie procesu iPhone'a może opóźniać timery; granicę bezpieczeństwa powinny stanowić generacje i kontrola uprawnień do zapisu.

Mock aplikacji nadal zwraca stały piksel z createSignedUrl. Nowa metoda download wykrywa brak pliku job-photos, co poprawia testy, ale nie sprawdza rzeczywistej ważności tokena, RLS, CDN ani HTTP cache. Nowe testy CAS wykonują głównie prymitywy; test w tytule wspomina A/B/C, a wykonuje przejęcie A→B. Test 403 zasiewa gotowy stan error. Dlatego wykonano dodatkowe publiczne operacje i rzeczywisty cache HTTP opisane wyżej.

Publiczne strony GitHub potwierdziły dwa sukcesy przebiegu [39605931733](https://github.com/wawis-klima/wawis/actions/runs/39605931733): attempt 1 i attempt 2. Dla obu widoczne success obejmują targeted regression groups, PostgreSQL dual-session, Playwright E2E, Verify Closure Gate i production build. Dowód: [zapis statusów kroków](release/job-steps.json).

Surowe logi i artefakty Closure Gate wymagają logowania; GitHub API w tym środowisku zwracało blokadę połączenia 403. Nie potwierdzam niezależnie deklarowanych 104 mobile PASS/20 desktop PASS na podstawie samych publicznych statusów. Lokalnie otrzymałem liczby z tabeli w punkcie 1. Publiczny status success kroku Closure Gate nie pozwala ocenić szczegółów jego JSON. Kontrola PostgreSQL CI bada odrębne izolowane scenariusze SQL; nie jest testem IndexedDB, cache HTTP lub dostawcy Supabase Storage.

Odczyt produkcyjnego Vercel app-version.json i push-sw.js był blokowany na poziomie połączenia CONNECT 403. Stan Vercel READY i aktywna wersja hosta pozostają NOT VERIFIED. Nie próbowano obchodzić blokady ani pozyskiwać sekretów. Publiczny preview Cloudflare nie zastępuje dowodu wdrożenia Vercel.

**8. Pozostałe funkcje i problem „Ładowanie zdjęcia”**

Pełny zestaw objął dodawanie JW/JZ, Multi-Split, wyświetlanie tabliczek, zdjęcia między sesjami pracownika i administratora, kreatory urządzeń, protokół i podpis, pobranie PDF, bramki kończenia montażu, uprawnienia UI, odświeżenie i wznowienie offline. 20 testów desktopowych przeszło. W badanych scenariuszach mock nie stwierdzono regresji tych funkcji wynikającej z 13.41. Test pobrania PDF w trybie mock nie potwierdza produkcyjnego renderowania/wysyłki PDF ani usług OCR.

Błąd OCR rozdzielono od aplikacji na podstawie trace. Błędy animacji odtworzono również na 13.40. Nie ma podstaw do przypisywania ich zmianom SHA lub kolejki.

Nie odtworzyłem w tym audycie dokładnego zgłoszenia produkcyjnego „Ładowanie zdjęcia” ustępującego po przejściu do innego montażu. 13.41 nie zmienia głównej logiki podglądu/cache URL. usePhotoPreview.js:40 czyści cache po zmianie selectedJob.id, co wyjaśnia możliwość odzyskania przez ponowne wejście, ale samo nie dowodzi przyczyny danego incydentu. P1-N2 i P1-N3 powodują odrębne, potwierdzone stany zalegania/niezgodności kolejki; nie utożsamiam ich automatycznie z tym objawem.

Do zebrania dowodu potrzebny jest zanonimizowany ślad od dodania zdjęcia do błędu i ponownego wejścia: wersja aplikacji/SW, job/photo/upload ID, owner i generation, faza i rozmiary plików, statusy download/sign/INSERT, informacja o cache HTTP i dekodowaniu img, czas odświeżenia szczegółów oraz zmiany widoczności strony. Bez zawartości zdjęć, danych klientów, tokenów i pełnych podpisanych URL. Test powinien opóźniać signing i szczegóły, zwracać wygasły URL, uruchamiać dwa reloady szczegółów w odwrotnej kolejności i potwierdzać pokazanie obrazu bez zmiany montażu.

**9. Docelowe testy regresyjne — rozdzielenie warstw**

| Warstwa | Obowiązkowy zakres i asercje |
| --- | --- |
| Kod + realny IndexedDB + kontrolowany transport | Różne pliki przy tym samym metadata; brak Web Crypto/read error; owner A/B; save/add/open/abort/quota; local/prepared bytes po reload; 403 bez auto-upload; 429/503 z backoff; 409 z tymi samymi/innymi bajtami; brak row/obiektu; utrata ACK; publiczne retry; A→B→C i spóźnione odpowiedzi. |
| Realny HTTP i SDK, bez atrap cache | P0-N1: cache świeżego 200 → usunięcie obiektu → restore → 404 z origin; żądania i cache eviction. Timeout body, opóźnienia, częściowy transfer, utrata internetu. |
| Dwie wersje i trwały profil przeglądarki | P0-N2: działający stary worker + nowa wersja na jednym origin; bariera DB, blocked upgrade, odnowienie/przejęcie lease, restart i migracje v1/v2/v3. |
| E2E mock mobile i desktop | Aparat/galeria, kadrowanie, JW/JZ/Multi-Split, OCR sukces i fallback, render img/naturalWidth, powrót do montażu, refresh, zmiana konta, brak fałszywego „zapisano”, blokady Protokołu/Zakończ, podpis i odczyt PDF. Ocenia przepływ UI. |
| Izolowany rzeczywisty Supabase | Osobny projekt lub lokalny stack i wyłącznie syntetyczne konta/dane. Prawdziwe JWT admin/pracownik A/B, SELECT/INSERT/DELETE Storage i photos, rzeczywista unikalność path, token refresh/wygaśnięcie, 409, nagłówki CDN/cache, bytes/hash po pobraniu z drugiej sesji. Końcowa kontrola rekordów, obiektów i kolejki; żadnych testów zapisu na danych produkcyjnych. |
| Fizyczny iPhone/PWA | Safari i zainstalowana PWA: aparat, HEIC/JPEG i rzeczywiste rozmiary, blokada ekranu, restart telefonu, force close, airplane mode, uśpienie >lease, aktualizacja SW z kolejką, presja pamięci, czas i transfer. Odczyt zdjęć na drugim urządzeniu. |

W każdym teście powodzenia wymagane są: oczekiwana liczba obiektów i rekordów photos, właściwy właściciel i przypisanie JW/JZ, zgodne bajty wersji uploadowanej oraz usunięcie lokalnego File dopiero po ważnym świeżym dowodzie. W każdym teście błędu wymagane zachowanie File i poprawny status umożliwiający dalszą pracę. Same liczniki mock nie potwierdzają produkcji.

**10. Plan konkretnych poprawek do akceptacji**

1. **P0-N1:** wymusić świeże pobranie do SHA, zachować rozmiar/hash, dodać test z prawdziwym HTTP cache i kontrolę cache izolowanego Supabase. Kryterium: brak obiektu nigdy nie usuwa trwałego File po wcześniejszym cache 200.
2. **P0-N2:** wprowadzić niedestrukcyjną barierę wersji IDB i obsługę blocked/versionchange. Kryterium: stary klient nie może wykonać DELETE/PUT po przejściu nowej wersji przez barierę; stare rekordy nadal odczytywalne.
3. **P1-N1:** usunąć zaufanie do zserializowanego lease_owner, zawsze claim dla publicznego retry, przerywać pracę po odrzuconym CAS. Kryterium: zero uploadów B przy aktywnym A oraz zero późniejszych uploadów starej generacji po wykrytej utracie claim.
4. **P1-N2:** zachować typ/status przyczyny weryfikacji, wdrożyć odrębne retry dla przejściowych błędów. Kryterium: 409→503/429→automatyczne uzgodnienie; 403/mismatch bez pętli i bez utraty pliku.
5. **P1-N3:** commit IDB przed statusem trwałego zapisu; zachować formularz i File po błędzie; retry od ponownego utrwalenia. Kryterium: quota/open failure nigdy nie daje fałszywego „Zapisano na telefonie”, a odzyskanie miejsca pozwala zapisać i wznowić.
6. **P2:** ograniczyć powtarzane weryfikacje bez osłabiania dowodu; poprawić selektory OCR i pomiar animacji; dodać WebKit oraz izolowany Supabase i fizyczny iPhone. Kryterium: znane reproduktory RED przechodzą po poprawkach, błędy nie są wyłączane, a koszty transferu/czasu są zmierzone.

Wszystkie punkty są propozycjami. Nie zastosowano ich do kodu. Najpierw wymagają akceptacji zakresu i wdrożenia przez zespół, następnie ponownego audytu według tych samych reproduktorów i dowodów CI.

**Odpowiedzi końcowe**

- **Czy WAWIS 13.41 skutecznie zabezpiecza zdjęcia przed utratą?** Częściowo: naprawia pierwotne scenariusze, ale nie daje podstaw do zamknięcia bezpieczeństwa. Cache i równoległa stara wersja nadal pozwalają utracić trwałą lokalną kopię w odtworzonych warunkach.
- **Czy istnieją dodatkowe scenariusze utraty danych?** Tak: P0-N1 i P0-N2 są odtworzone; P1-N3 dodatkowo pokazuje ryzyko zdjęcia, którego nie udało się utrwalić. Występowanie incydentów na produkcji nie zostało potwierdzone.
- **Czy zabezpieczenia mogą utrudniać pracę monterów lub spowalniać aplikację?** Tak: pełne odczyty i SHA zwiększają koszt zapisu; błędy weryfikacji i brak kryptografii mogą pozostawiać kolejkę wymagającą ręcznej obsługi. Rzeczywisty wpływ na iPhone'a wymaga pomiaru urządzenia.

**FAIL — do czasu naprawy wskazanych P0 i ponownego sprawdzenia pełnych sekwencji.**
