# WAWIS: awaria synchronizacji 21–22.10.2026 i kandydat naprawy

Status: **kandydat do oceny; brak zgody na produkcję**. Nie wykonano merge, deploymentu, migracji Supabase ani zapisu produkcyjnych danych. Godziny w raporcie: Europe/Warsaw (CEST, UTC+02:00).

## A. Przyczyny i granice dowodów

Przeanalizowano lokalną pełną historię `wawis-klima/wawis`, oryginalną 13.38 `84bd0936`, 13.48 `826ce473`, rollback 13.42 `bcc54f2d` i rollback 13.38 `11a8922c`. Drzewo bieżącej bazy odpowiada przywróconej 13.38. Odczytano CHANGELOG z historycznej 13.48 i dyskusje/metadane PR #382–394, w tym #383, #384, #386, #389, #390, #391–394. Odczytano CLOSURE-GATE.md, REGRESSION-LEDGER.md i wcześniejszy SOURCE-AUDIT v10.89. Źródła produkcyjne odczytano przez Supabase MCP: `app_diagnostic_events`, logi Storage, katalog indeksów i polityk. Żaden odczyt nie zmieniał danych.

### Potwierdzone

| Ustalenie | Dowód i mechanizm | Trwała reprodukcja |
|---|---|---|
| P1: rollback uniemożliwia otwarcie kolejki v4 przez 13.38 | `photo-offline-queue.js`, `openQueueDb`: 13.38 podaje wersję 3 do `indexedDB.open`; od 13.42 wersja 4. Starsza wersja wywołuje `VersionError`. `listPhotoQueueItems` przechwytuje błąd i zwraca pustą listę; `savePhotoQueueItem` zwraca false. Dotyczy również online. Pliki pozostają w IDB. | `mobile-durable-outbox.spec.js`, RED/GREEN rollback: rzeczywisty IDB v4, wykonanie kodu z `84bd0936`, stara lista pusta, nowa odzyskuje oryginalne bajty. Oryginalny test migracji `mobile-photo-audit-1342.spec.js` obejmuje także v3→v4 i blokowanie upgrade. |
| P1: rzeczywiście wysłano puste żądania | Logi Storage 22.10, 11:53:09.868 i 11:53:11.446 CEST: iPhone OS 18_7, `POST`, multipart/form-data, `content_length=0`, 400 `InvalidRequest`, `No content provided`. To dowód pustego transportu; sam nie wyjaśnia, dlaczego WebKit wyprodukował puste body. | Oryginalny `mobile-ios-binary-upload-v1346.spec.js`; dodatkowo prawdziwy lokalny Supabase i porównanie pobranych JPEG bajt po bajcie. |
| P1: 13.48 zatrzymała się przed przygotowaniem plików | Produkcyjne `app_diagnostic_events`: cztery `photos.upload.claim-write.failed`, kod `PHOTO_QUEUE_STAGE_FAILED`, retry_count=2, o 14:29:49.985, 14:29:54.701, 14:29:55.684, 14:29:57.022 CEST. W `performQueuedPhotoUpload` to false z `updatePhotoQueueItem(uploadingPatch, guard)` **przed** `compressImageFn`, body i Storage. O 14:59:58 cztery `photos.queue.claim.failed`, kod niesklasyfikowany. | `mobile-durable-outbox.spec.js`: odtworzenie odrzucenia ponownego zapisu File w tym samym miejscu, stary kod false, zapis własnego ArrayBuffer przechodzi. Jest to reprodukcja klasy awarii, nie dowód identycznego błędu silnika na telefonie. |
| P1: lokalny formularz i stan serwera miały różne znaczenie | `useSelectedJobActions.queueDeviceSaveOffline` nakłada optymistyczne `device_model`, `device_serial_number`, `offline_pending`; historyczne `reloadJobSummary/reloadJobDetails` nakładały pusty stan serwera. Ponowne otwarcie odtwarzało operację IDB. To tłumaczy zielony→czerwony→zielony bez zapisu urządzenia na serwerze. #390 opisuje ten sam mechanizm. | Oryginalny `smoke-selected-job-sync-v1347.mjs` i nowe testy overlay oraz blokady protokołu. |
| P1: globalny worker blokował wybrany montaż | Historyczne `retryAllPersistedPhotoUploads` oczekiwało na globalne promise użytkownika przed retry; bez filtra jobId. Naprawa 13.47 skraca tę zależność, lecz nie naprawia lokalnego claim-write. | Oryginalny `mobile-manual-photo-priority-v1347.spec.js`: drugi montaż synchronizuje się przy zawieszonym pierwszym. |
| P1: zapis zdjęć i operacji urządzenia nie był atomowy | `queueDeviceSaveOffline` najpierw zapisuje zdjęcia w jednej bazie IDB, później urządzenie w drugiej. Przerwanie pomiędzy pozostawia zdjęcia bez zamierzonej operacji urządzenia. Ścieżka online najpierw zapisywała jobs i dopiero później zdjęcia. | Nowy trwały intent w jednej transakcji `job-operations`: komplet dokumentacji i dane urządzenia. Test quota/rollback transakcji i restart. |
| P1: niepełne zabezpieczenie operacji urządzenia | Historyczne `claimOfflineJobOperation` miało wyłącznie czas lease; update/delete nie sprawdzały owner/generation. Globalne promise nie było rozdzielone na użytkowników. | Nowe tokeny/generacje, test spóźnionego zapisu i usuwania oraz test dwóch niezależnych kart. |

### Czego nie udowodniono

Produkcja nie zapisała dokładnej przyczyny odmowy `updatePhotoQueueItem` w 13.48. Funkcja sprowadza wyjątek transakcji, brak rekordu i odrzucenie guard do tego samego `false`; console.warn traci szczegóły przez celową anonimizację. Nie można uczciwie stwierdzić, że przyczyną był konkretnie `DataCloneError`, uszkodzony Blob, quota albo przegrany lease. Nie pobrano lokalnej bazy z fizycznego telefonu i nie wykonano na nim pomiaru. Zastąpienie uchwytów File bajtami usuwa zależność od ponownego zapisu tych uchwytów; wymaga odbioru na zachowanej kolejce iPhone'a.

Nowa diagnostyka rozróżnia `PHOTO_IDB_WRITE_FAILED` od `PHOTO_QUEUE_FENCE_REJECTED` i błędu integralności, bez ścieżek, danych klientów, seriali ani treści exception. Sam brak POST Storage nie wskazuje na RLS — zapis mógł zatrzymać się wcześniej, jak w powyższych czterech zdarzeniach.

### Dlaczego kolejne wersje nie domknęły problemu

| Wersja / commit | Co zmieniła | Co pozostawało |
|---|---|---|
| 13.43 `8995620` | Kolejka edycji urządzenia i zależności zdjęć | Rozdzielone transakcje, brak pełnego dowodu binarnego i odbioru iPhone. Produkcyjne unhandledrejection w module photos. |
| 13.44 `cae072c` | Ręczny retry/backoff | Ręczny przycisk uruchamiał ten sam wadliwy przepływ; nie wytwarzał bajtów zdjęcia. Produkcyjne unhandledrejection pozostały. |
| 13.45 `838c2b7` | Obsługa wyjątków restore i pojedynczego rekordu | Chroniła dalsze rekordy, ale nie eliminowała pustego multipart; log Storage potwierdza 0 B. |
| 13.46 `5efadcb` | ArrayBuffer dla UA iOS | Rozwiązywała transport po przygotowaniu. Błąd lokalnego zapisu przed przygotowaniem nadal uniemożliwiał dojście do uploadu. |
| 13.47 `dbb3fa7` | Wybrany job i overlay danych lokalnych | Poprawiała planowanie i prezentację, nie zapis `uploadingPatch` w IDB. |
| 13.48 `826ce473` | Instrumentacja etapów | To wydanie diagnostyczne. Wskaźnik claim-write podał granicę awarii, ale nie przyczynę odmowy transakcji. |
| Rollback 13.38 `11a8922c` | Powrót oryginalnego drzewa | Dodał niezgodność czytnika v3 z zachowaną bazą v4. Nie jest wyjaśnieniem awarii 13.43–48. |

## B. Architektura i wybór

Zachowano istniejące deterministyczne ścieżki, dokładne dopasowanie zdjęć, SHA-256 readback, CAS urządzenia, RLS i ograniczenia unikalności. Ich pełne zastąpienie wymagałoby niepotrzebnej migracji oraz utrudniłoby odzyskiwanie starych kolejek. Zastąpiono granice trwałego zapisu i transportu oraz rozdzielone wejścia online/offline.

| Obszar | Wcześniej | Kandydat |
|---|---|---|
| Źródło zamiaru | Formularz + dwa niezależne zapisy | Jeden atomowy rekord zawierający pola urządzenia i pełne bajty JW/JZ. Kolejka zdjęć jest odtwarzalną projekcją. |
| Format zdjęcia | Serializowany File/Blob z kamery lub IDB | Własny ArrayBuffer, dodatni rozmiar i SHA-256; Blob odtwarzany wyłącznie dla UI. Przy błędzie arrayBuffer dostępny FileReader. |
| Online/offline | Różna kolejność zapisów | Edycja wyłącznie urządzenia zawsze najpierw utrwala intent. Brak sieci nie wymaga `getUser` do lokalnego zapisu. |
| Autoryzacja wysyłki | Możliwy fallback do cache profilu | Upload wymaga rzeczywistego getUser zgodnego z właścicielem, a App sprawdza generację sesji. |
| Transport | File/multipart poza iOS | Zweryfikowany ArrayBuffer na wszystkich platformach. Nie wysyłamy pustej zawartości. |
| Potwierdzenie | Niejednoznaczne UI/receipt | Dokładna ścieżka + pobrane bajty + rekord photos, potem jobs CAS i ponowny odczyt jobs. Receipt nie omija kontroli urządzenia. |
| Współbieżność | Photo fencing, device lease wyłącznie czasowy | Fencing owner/generation w obu kolejkach. Nie zastępujemy aktywnie synchronizowanej edycji. |
| Restart i foreground | online + timer | online/pageshow/focus/visibilitychange + timer; sesja workera nie zależy od licznika kolejki. |
| UI | Zielony stan mógł znaczyć tylko formularz | `offline_pending`, konflikt i błąd blokują protokół; lokalne pola pozostają przy błędzie wysyłki. |

Zdjęcia przechodzą `local → uploading → prepared → storage_uploaded → potwierdzenie photos i SHA → usunięcie projekcji`. `prepared` i `storage_uploaded` są etapami, nie komunikatami sukcesu. Przejścia statusów dopuszcza jawna `PHOTO_QUEUE_TRANSITIONS`. Błąd przejściowy wraca do local z backoff; trwały do error z zachowaniem bajtów. 409 wymaga porównania istniejącego obiektu; sam konflikt nie jest ACK.

Intent urządzenia przechodzi pending→syncing→usunięcie dopiero po weryfikacji. Przejściowy błąd daje pending/backoff, trwały error, konflikt CAS/unikalnego serialu conflict. Ręczny retry usuwa backoff, nie przejmuje aktywnego lease ani konfliktu. Nieudany odczyt IDB nie jest pustą kolejką: status UI wyświetla błąd zamiast „Wszystko wysłane”. Nie ma gwarancji działania po zamknięciu PWA iOS.

## C. Zmiany techniczne

- `photo-bytes.js`: materializacja bajtów, rozmiar, SHA-256, kodowanie/dekodowanie istniejącego pola kolejki. Konwersja poza aktywną transakcją IDB.
- `photo-offline-queue.js`: v4, blokowane upgrade z ograniczonym oczekiwaniem, zamykanie połączeń przy versionchange, leniwa konwersja starego rekordu z CAS, oryginalne fencing i ochrona plików, bardziej jednoznaczna diagnostyka.
- `nameplate-device-intent.js`: jedna transakcja zapisuje komplet zdjęć i dane urządzenia; brak produkcyjnego SQL i nowych tabel. Awaria projekcji nie usuwa intentu.
- `job-offline-store.js` i `job-offline-sync.js`: fencing, izolacja promise użytkowników, zachowanie dokumentacji przy zastępowaniu nieaktywnych edycji, wybrany job, kontrola wszystkich zależności i rzeczywistego Storage, CAS i końcowy odczyt urządzenia. Stare operacje respektują oczekujące zdjęcia nawet bez listy required paths.
- `useSelectedJobActions.js`: edycja samego urządzenia używa trwałego wejścia online/offline. Pozostałe formularze zachowują dotychczasowy zakres.
- App/JobDetailsPanel/PhotoSyncStatus: wznowienie w aktywnej aplikacji, ręczna synchronizacja, overlay i blokada protokołu. Reguły OCR/AI i numerów nie zostały zmienione; zachowano `verificationMethod`, również manual.

Nie powstała nowa wersja wydaniowa: metadane nadal 13.38 po bazowym rollbacku. Testowy kandydat musi być identyfikowany SHA gałęzi. Numer przyszłego wydania i proces release dopiero po akceptacji.

## D. Testy i wyniki

Dokładne wyniki komend i logi są w pakiecie dowodowym. Nie utożsamiamy lokalnego Closure GO z odbiorem produkcyjnym ani urządzeniowym. `mobile-durable-outbox.spec.js` uruchamia oryginalny kod historyczny z git do reprodukcji RED; fixture błędu File odtwarza mechanizm, nie konkretny wyjątek telefonu.

| Wymaganie | Pokrycie |
|---|---|
| Online, offline, offline→online, restart | Nowe testy intentu, oryginalny mobile-resilience i rzeczywisty lokalny provider |
| Utrata sieci, przerwanie po pierwszym zdjęciu | HTTP 503 na drugim zdjęciu, restart/retry, dokładnie dwa obiekty i dwa rekordy |
| Logout/login, zmiana użytkownika | Anulowanie podczas uploadu + odtworzenie; istniejące testy izolacji sesji; brak zdalnego uploadu danych innego właściciela |
| v3→v4, istniejące v4, rollback | Oryginalny audit 13.42 i RED/GREEN oryginalnej 13.38 |
| 400/403/409/429/503 | Nowa macierz, oryginalne testy konfliktu i transient readback; 409+inne bajty nigdy nie daje ACK |
| 0 B, niepełne bajty, quota | Materializacja/transport odrzucają; poprzednia transakcja i formularz zachowane |
| Dwa workery, spóźnione callbacki | Oryginalne testy dwóch kart zdjęć, nowe dwa okna dla intentu, owner/generation/CAS |
| Brak duplikatów | Deterministyczne identity i ścieżki; rzeczywisty indeks unique photos; powtórny sync bez nowego rekordu |
| Refresh i protokół | Overlay, explicit pending/error/conflict gate, istniejące E2E protokołu |
| Pozostałe moduły | Pełna klasyfikacja critical, grupy core/jobs/photos/protocol/roles/push/fuel/nameplates/sms/desktop/mobile/infra i wymagane E2E |

Rzeczywisty provider jest izolowanym Docker fixture: PostgreSQL 17, PostgREST 12.2.12 i Supabase Storage 1.80.2 (wersja API z produkcyjnych logów). Test używa aktualnego klienta SDK z lockfile, poprawnych JPEG generowanych przez canvas, prawdziwych żądań HTTP i pobrania obiektów z dysku Storage; sprawdza SHA/bajty, dekodowanie obrazu, rekordy photos/jobs, idempotencję i odmowę RLS. Lokalny gateway odtwarza routing/CORS zwykle dostarczane przez Supabase Kong. Fixture nie ma GoTrue; identyfikację klienta dostarcza podpisany JWT fixture oraz adapter getUser. Fixture wykonuje też istniejącą funkcję `sync_device_from_job_row` porównaną z odczytaną definicją produkcyjną: sprawdza faktyczny rekord devices i odmowę duplikatu SN (23505). Nie dowodzi to produkcyjnego OAuth, wszystkich triggerów i polityk produkcyjnych ani zachowania iOS. Zachowano te ograniczenia w odbiorze.

Wykonawczy test dwóch niezależnych sesji PostgreSQL zapisuje dwa różne pg_backend_pid, dokładnie jednego zwycięzcę CAS i jeden końcowy rekord devices. Dodatkowy test przycisku ręcznego odtworzył RED (24 px), po przywróceniu stylu otrzymuje GREEN (minimum 44 px, rzeczywiste kliknięcie i zachowanie intentu offline).

Oryginalnych asercji auditów nie usunięto. Naprawiono fixture odczytu rzeczywistych bajtów ArrayBuffer, auth.getUser i Storage readback; test quota wyczerpuje nowy właścicielski magazyn intentu zamiast wyłącznie jego odtwarzalnej projekcji. Kontrolę starej ścieżki transportu rozszerzono na binarny transport wszystkich platform.

Próba doinstalowania WebKit 26.4 została zablokowana polityką sieci środowiska (HTTP 403 Domain forbidden dla CDN Playwright); nie obchodzono blokady. Lokalne E2E korzystają z Chromium, także z emulowanym UA/viewport iPhone.

**Fizyczny iPhone Safari oraz PWA: NOT VERIFIED. Produkcyjny test zapisu: NOT EXECUTED (celowo). Nie deklarujemy CLOSED ani gwarancji odzyskania pliku, którego bajty zostały już utracone przez system.**

## E. Bezpieczne wdrożenie i wycofanie

1. Przed jakimkolwiek wydaniem: przegląd kodu i dowodów, czysty commit, CI/Closure Gate na dokładnym SHA. Nie zmieniać `RELEASE-GATE`, workflowów ani zasad w celu uzyskania zielonego wyniku.
2. Zachować kolejki telefonów. Bez odinstalowania PWA, kasowania IDB/localStorage, czyszczenia danych witryny ani masowego resetu cache. Jeśli użytkownik ma niezapisany formularz, najpierw bezpiecznie zatwierdzić lokalny zapis w wersji testowanej lub zachować zdjęcia poza aplikacją — bez automatycznego resetu.
3. Projekt zmiany lokalnej: zdjęciowa baza zachowuje numer 4 i store `queued-photos`; `local_file`/`prepared_file` nowych rekordów zawierają ArrayBuffer oraz pola SHA. Stare File/Blob są czytane i konwertowane pod CAS dopiero po udanym odczycie. Offline DB pozostaje v2; komplet intentu mieści się w istniejącym payload. Nie wykonujemy migracji Supabase. Test rollbacku musi uwzględniać oba formaty.
4. Na izolowanym środowisku testowym wykonać scenariusz z dokumentu IPHONE-ODBIOR.md na rzeczywistym telefonie: osobno Safari i PWA, także zachowana kolejka z nieudanego wydania. Samo otwarcie innej domeny preview nie daje dostępu do starej IDB domeny produkcyjnej! Odzyskiwanie produkcyjnej kolejki wymaga kompatybilnego kodu na tym samym origin i osobnej autoryzacji wdrożenia.
5. Dopiero po poleceniu **„Wdrażaj”**: standardowy release z nowym numerem >13.48, potwierdzenie SHA i backendu, kontrola testowego montażu. Najpierw mała grupa pracowników; sprawdzić lokalny zapis, kolejki, niezerowe body, readback i zgodny zapis urządzeń. Rozszerzyć po pozytywnym odbiorze.
6. Telemetria alarmowa: rosnące pending/error, `PHOTO_IDB_WRITE_FAILED`, `PHOTO_QUEUE_FENCE_REJECTED`, 0 B, brak ACK po powrocie aplikacji. Bez publikacji seriali, zdjęć i ścieżek klientów.
7. Rollback musi zachować czytnik v4, obsługę ArrayBuffer/File oraz payload dokumentacji intentu. Nie wracać do dokładnego oryginału 13.38 z `DB_VERSION=3`; nie obniżać numeru IDB. Przed wydaniem przygotować osobną gałąź wycofania ze zgodnym czytnikiem i zatrzymanym zdalnym drainem, lecz aktywnym lokalnym zapisem. Test: v3→kandydat→kompatybilny rollback→kandydat, identyczne bajty i brak dubli. Nie ma transakcyjnego cofnięcia Storage+SQL; już potwierdzone obiekty pozostają, retry uzgadnia ich dokładne ścieżki.
8. iOS może usunąć dane witryny przy braku miejsca lub działaniu użytkownika; kod nie może zagwarantować trwałości wobec takiego zdarzenia. Dodatkowa kopia intentu zwiększa użycie dysku do chwili potwierdzenia. Błąd quota pozostawia formularz, nie wyświetla fałszywego sukcesu. Nie ma gwarancji wysyłania po zamknięciu aplikacji.

## F. Instrukcja właściciela

Patrz IPHONE-ODBIOR.md. Warunek akceptacji: dwa obrazy JW/JZ na serwerze o niezerowym rozmiarze i zgodnych bajtach, właściwe rekordy photos, zgodne pola jobs i właściwe urządzenie, pusta kolejka wyłącznie po ACK, a dopiero wtedy aktywny protokół. Sam zielony komunikat na telefonie nie stanowi dowodu.
