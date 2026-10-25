# WAWIS — plan usunięcia problemów P0 i P1 (po audycie z 25.10.2026)

**Status:** propozycja do akceptacji właściciela. Do akceptacji niczego z tego planu nie wdrażam.
**Podstawa:** `docs/WAWIS-AUDYT-KOMPLEKSOWY.md` (ocena 6/10).
**Ograniczenia z polecenia właściciela (25.10.2026, 18:40):**

- Do zakończenia testów 13.70 na iPhone'ach Pawła i Kacpra (26.10) nie wdrażam niczego poza krytycznymi poprawkami bezpieczeństwa lub awarii.
- Nie zmieniam widoczności montaży dla pracowników ani funkcjonalności protokołu offline — najpierw rozmowa.
- Priorytetem jest bezpieczeństwo danych. Bez destrukcyjnych operacji i bez zmian w produkcji na etapie planowania.

---

## 1. Kolejność prac — w skrócie

| Etap | Co | Dlaczego w tej kolejności | Kto | Ryzyko |
|---|---|---|---|---|
| **E0** | Test 13.70 na iPhone'ach, zamrożenie wydań, gotowa procedura wycofania | Chroni monterów w poniedziałek | Pracownicy + ja | brak (procedura) |
| **E1** | Kopie zapasowe: baza, zdjęcia, protokoły — poza Supabase, z próbą odtworzenia | Dane są nie do odtworzenia, kod tak | Ja + właściciel (konta, sekrety) | niskie |
| **E2** | Oddzielenie Cloudflare Pages od produkcji | Każdy push gałęzi publikuje kopię aplikacji o nieznanej konfiguracji | Właściciel (panel) + ja (weryfikacja) | niskie |
| **E3** | Fundament testów: WebKit w CI, testy wykonawcze, schemat produkcji w repozytorium, lokalny Supabase w CI | Bez tego kolejne poprawki offline nie będą wiarygodnie sprawdzone | Ja | niskie (tylko CI) |
| **E4** | Kompletność offline po aktualizacji (precache wersji) + odporne otwieranie lokalnych baz | Najczęstszy realny scenariusz awarii w terenie | Ja | średnie (service worker) |
| **E5** | Ochrona podpisu klienta — wariant minimalny bez zmiany funkcjonalności protokołu | Wymaga decyzji; przygotowany, nie wdrożony | Decyzja właściciela | średnie |
| **E6** | Integralność zdjęć historycznych (6 pustych plików, 30 plików bez rekordu) | Dane, ale bez pilności | Ja (raport) + decyzja właściciela | niskie |

Etapy E1, E2 i E3 są od siebie niezależne i mogą biec równolegle. E4 zależy od E3 (testy WebKit i testy aktualizacji muszą istnieć wcześniej). E5 i E6 czekają na decyzje.

**Dlaczego tak:** kopie zapasowe są pierwsze, bo błąd w kodzie da się cofnąć, a utraconych zdjęć i podpisów nie. Testy są przed zmianami offline, bo seria 13.42–13.70 pokazała, że poprawki offline bez testu w WebKit i na iPhonie kończą się kolejnymi poprawkami.

---

## 2. Etap E0 — poniedziałek 26.10.2026: test 13.70 i zamrożenie

**Fakty:** pracownicy ostatnio używali 13.55, 13.38, 13.36 i 13.28. Po otwarciu aplikacji z internetem telefon sam przejdzie na 13.70. To pierwszy kontakt pracowników ze zmianami 13.42–13.70.

**Kolejność:**

1. Paweł otwiera aplikację z internetem.
   - Sprawdzam w telemetrii, że zgłasza `13.70`.
   - Sprawdzam, czy lokalna kolejka zdjęć nie zgłasza błędu.
2. Lista testowa (ok. 15 min), na podstawie `docs/iphone-test-v1362.md`:
   - **Diagnostyka:** wersja 13.70, kolejka zdjęć bez błędu, stan „Odczyt tabliczek bez internetu” — oba czytniki „zapisany w telefonie”, po kilkunastu sekundach z internetem.
   - **Jeśli na telefonie są stare, niewysłane zdjęcia:** baner wstrzymania. Decyzja pracownika: „Wyślij stare zdjęcia” albo „Usuń stare zdjęcia”.
   - **Zdjęcie z internetem:** dodaje się. Potem sprawdzam w bazie (`SELECT`), że plik ma rozmiar większy niż 0 B.
   - **Tryb samolotowy, zdjęcie:** komunikat „bez internetu”. Nic nie trafia do pamięci telefonu.
   - **Tryb samolotowy, tabliczka:**
     - model i numer SN wpisane przez czytnik;
     - ostrzeżenie „Brak internetu”;
     - „Potwierdź” dostępne dopiero po zaznaczeniu sprawdzenia SN;
     - „Zapisz” → okno „Brak internetu” → „Zamknij okno”;
     - z internetem: ponowne otwarcie przywraca dane, a „Zapisz” je zapisuje.
   - **Status i komentarz offline:** po powrocie internetu są wysłane.
   - **Tryb samolotowy, ponowne otwarcie aplikacji:** sprawdzam, czy montaż i formularz się otwierają. To scenariusz z P1-1 — wynik jest ważny dla etapu E4.
3. Jeśli lista u Pawła przejdzie, to samo u Kacpra, a pozostali pracują normalnie.
4. Wyniki zapisuję w `REGRESSION-LEDGER.md` (statusy `FIXED-UNVERIFIED` → `CLOSED` dla potwierdzonych pozycji). Zmiana dokumentacji idzie bez nowego wdrożenia.

**Zamrożenie:** do końca testów nie scalam niczego do `main`. Wyjątki:

- poprawka błędu, który blokuje pracę monterów;
- zagrożenie danych lub bezpieczeństwa.

Wyjątek idzie normalną ścieżką (PR, CI, Closure Gate) i trafia najpierw na jeden telefon.

**Kryterium zakończenia E0:**

- obie listy zaliczone;
- telemetria bez nowych błędów `error` dla 13.70 przez 2 godziny pracy;
- nowe zdjęcia z dnia mają pliki > 0 B.

---

## 3. Etap E1 — kopie zapasowe i możliwość odtworzenia (priorytet)

### 3.1. Co jest dziś (sprawdzone)

| Dane | Wielkość | Obecna ochrona | Ocena |
|---|---|---|---|
| Baza danych (montaże, klienci, urządzenia, SMS, użytkownicy) | 163 montaże, 1347 klientów, 743 urządzenia… | Plan **Pro** (sprawdzone): dzienne kopie z ostatnich 7 dni, fizyczne (Postgres 17). Odtworzenie tylko całego projektu, z przerwą. Kopii fizycznej nie da się pobrać. | Chroni przed awarią Supabase z ostatnich 7 dni. Nie chroni przed: usunięciem projektu (kopie znikają razem z nim), błędem zauważonym po 8 dniach, potrzebą odtworzenia jednego montażu bez cofania całej bazy. |
| Zdjęcia (`job-photos`) | 1023 pliki, 496 MB | **Brak kopii.** Dokumentacja Supabase: kopie bazy nie obejmują plików Storage. | Największa luka. |
| Protokoły PDF + podpisy | 51 PDF (8 MB) + 20 podpisów | **Brak kopii.** | Luka — to dokumenty z podpisem klienta. |
| Konfiguracja: Edge Functions, sekrety, ustawienia Auth | 12 funkcji | Kod funkcji częściowo w repozytorium (rozjazd, P2-10). Sekrety i ustawienia Auth tylko w panelu. | Do opisania (lista sekretów bez wartości). |

Istniejąca w repozytorium funkcja `backup-storage-assets` kopiuje pliki do drugiego projektu Supabase, ale nie jest wdrożona (brak tabeli kolejki). Rozwiązanie z drugim projektem Supabase zostawia wszystko u jednego dostawcy i na jednym koncie, więc nie polecam go jako jedynej kopii.

### 3.2. Proponowane rozwiązanie (do akceptacji)

**Codzienna kopia poza Supabase, wykonywana przez zaplanowany workflow GitHub Actions — tylko odczyt produkcji:**

1. **Baza:** `pg_dump` (logiczny zrzut) schematów `public`, `private`, `auth`, `storage` (metadane), skompresowany.
2. **Pliki:** przyrostowa synchronizacja bucketów `job-photos`, `job-protocols`, `job-protocol-signatures` (i `fuel-odometer-photos`) przez protokół S3 Supabase Storage (`rclone sync` lub `aws s3 sync` z kluczami tylko do odczytu, jeśli dostępne). Pobierane są tylko nowe i zmienione pliki, więc dzienny transfer wyniesie kilka–kilkadziesiąt MB.
3. **Szyfrowanie:** zrzut bazy (dane osobowe klientów) szyfrowany kluczem publicznym (`age`) przed wysłaniem. Klucz prywatny ma tylko właściciel (np. w menedżerze haseł). Zdjęcia: szyfrowanie po stronie magazynu lub `rclone crypt`.
4. **Magazyn docelowy** (jeden, do wyboru przez właściciela):

   | Opcja | Koszt przy ~1 GB | Zalety | Wady |
   |---|---|---|---|
   | **Cloudflare R2** | praktycznie 0 zł (10 GB gratis) | Masz już konto Cloudflare; zgodny z S3; bez opłat za pobranie przy odtwarzaniu | Kolejny dostawca do pilnowania |
   | Backblaze B2 | ok. 0,03 USD/mies. | Blokada usunięcia (Object Lock) — ochrona nawet przed przejęciem kluczy | Nowe konto |
   | Google Drive (konto firmowe) | w ramach obecnego planu | Znane narzędzie | Wolniejszy, gorzej nadaje się do przyrostowej synchronizacji |

   **Moja rekomendacja:** Cloudflare R2 z osobnym kontem lub tokenem tylko do zapisu w jednym buckecie i z regułą przechowywania (kopie bazy: 30 dni dziennych + 12 miesięcznych). Pliki: synchronizacja bez usuwania — skasowane zdjęcie w Supabase zostaje w kopii.
5. **Częstotliwość:** codziennie o 2:30 (poza godzinami pracy) i ręcznie przed każdą zmianą bazy (migracją).
6. **Powiadomienie:** nieudana kopia wywołuje czerwony status workflow i e-mail z GitHub do właściciela. Raz w tygodniu zapisuję podsumowanie (liczba plików i rozmiar w kopii vs w Supabase).

**Ochrona produkcji w tym rozwiązaniu:**

- Workflow tylko czyta produkcję: połączenie z bazą użytkownikiem z prawem odczytu, a jeśli to niemożliwe — hasłem bazy w sekrecie GitHub i wyłącznie poleceniem `pg_dump`.
- Klucze S3 do Storage — tylko odczyt, jeśli Supabase na to pozwala. Jeśli nie, ograniczam polecenia do `copy`/`sync` od źródła do celu (nigdy odwrotnie) i opisuję to w workflow.
- Workflow nie działa na PR-ach, tylko według harmonogramu, z gałęzi `main`. `permissions: contents: read`.

**Czego potrzebuję od właściciela (zgoda wymagana przez CLAUDE.md — sekrety i nowa infrastruktura):**

1. Wybór magazynu i utworzenie bucketu (pomogę krok po kroku).
2. Sekrety w GitHub (Settings → Secrets → Actions), które wpisuje właściciel — nie ja, i nie przez czat:
   - `SUPABASE_DB_URL` (połączenie do bazy);
   - `SUPABASE_S3_ACCESS_KEY` / `SUPABASE_S3_SECRET`;
   - klucze magazynu docelowego;
   - publiczny klucz `age`.
3. Zgoda na nowy zaplanowany workflow (obszar workflowów i sekretów).

### 3.3. Odtwarzanie — procedura i próba

Kopia bez sprawdzonego odtworzenia nie jest kopią. Proponuję **próbę odtworzenia przed uznaniem E1 za gotowe i potem raz w miesiącu:**

1. Osobny, darmowy projekt Supabase „wawis-restore-test” (albo lokalny Postgres w CI). **Nigdy produkcja.**
2. Odtworzenie zrzutu bazy:
   - porównanie liczby rekordów kluczowych tabel z produkcją (`SELECT count(*)`);
   - kontrola sum: liczba zdjęć na montaż, protokoły, ostatnie `updated_at`.
3. Losowe 20 zdjęć i 5 protokołów z kopii: suma kontrolna i rozmiar zgodne z metadanymi `storage.objects`.
4. Wynik zapisany w `docs/backup-restore-drill-<data>.md`.

**Scenariusze odtworzenia (opisane w procedurze):**

| Sytuacja | Sposób |
|---|---|
| Usunięty jeden montaż | Kosz aplikacji (`admin_restore_deleted_job`) — już działa. Starsze: wiersze z kopii logicznej wstawione ręcznie po zgodzie właściciela. |
| Usunięte lub uszkodzone pliki | Skopiowanie wskazanych plików z kopii do bucketu (po zgodzie). |
| Błąd danych sprzed < 7 dni dotyczący całej bazy | Dzienna kopia Supabase (całość, przerwa w pracy) — ostateczność. |
| Utrata projektu lub konta Supabase | Nowy projekt + zrzut + pliki + Edge Functions z repozytorium + sekrety z listy (wartości od właściciela) + zmiana zmiennych Vercel. Szacunkowo pół dnia; do potwierdzenia w próbie. |

**Rozważenie PITR** (odtworzenie z dokładnością do minut): ok. 100 USD/mies. + wymaga mocniejszej instancji. Przy obecnej skali uważam to za niepotrzebne, jeśli działa codzienna kopia poza Supabase. Decyzja właściciela.

**Kryteria gotowości E1:**

- 7 kolejnych udanych kopii dziennych;
- udana próba odtworzenia (liczby rekordów i sumy kontrolne zgodne);
- procedura w repozytorium;
- lista sekretów (bez wartości) w `docs/`.

**Ryzyko:** niskie. Jedyna styczność z produkcją to odczyt (obciążenie: zrzut kilku MB, raz dziennie, w nocy).

---

## 4. Etap E2 — oddzielenie Cloudflare Pages od produkcji

**Fakty:**

- Każdy push dowolnej gałęzi buduje publiczną aplikację `https://<gałąź>.wawis.pages.dev` (check „Cloudflare Pages” w każdym PR, ostatnio `release-v13-70.wawis.pages.dev`).
- Polecenia budowania Cloudflare nie znam (brak dostępu). Jeśli to `npm run build`, bramki się nie zatrzymają: `vercel-deploy-guard` poza Vercel zwraca „SKIP” (sprawdzone w kodzie).
- Prawdopodobnie istnieje też „produkcja” Cloudflare (`wawis.pages.dev`) budowana z `main`.
- Aplikacja bierze adres i klucz Supabase ze zmiennych środowiskowych, więc wszystko zależy od ustawień w panelu Cloudflare. Nie mam do nich dostępu.

**Ryzyka:**

- działająca kopia aplikacji na niezatwierdzonym kodzie, podłączona do prawdziwych danych — pracownik, który trafi na taki adres, zapisze dane przez nieprzetestowany kod;
- wiarygodnie wyglądający adres do podszywania się;
- jeśli w ustawieniach Supabase Auth są dozwolone adresy `*.pages.dev`, linki z e-maili (reset hasła) mogą prowadzić do podglądu.

**Kroki właściciela (ok. 10 minut, poprowadzę na zrzutach ekranu):**

1. Cloudflare → Workers & Pages → projekt `wawis` → Settings:
   - **Environment variables** dla *Production* i *Preview*: czy jest `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`? Zrzut ekranu bez wartości kluczy.
   - **Builds → Branch control:** czy `main` jest gałęzią produkcyjną i czy podglądy są dla wszystkich gałęzi?
2. Decyzja, do czego Cloudflare jest potrzebny. Jeśli nie wiadomo — najpewniej pozostałość po wcześniejszym hostingu.

**Warianty (moja rekomendacja: A):**

- **A. Odłączenie integracji Git i wyłączenie projektu** (Settings → Builds → Disconnect, a potem ewentualnie usunięcie wdrożeń). Najprostsze i całkowicie usuwa ryzyko. Vercel zostaje jedyną produkcją.
- **B. Jeśli Cloudflare jest potrzebny:**
  - podglądy tylko z atrapą (`VITE_SUPABASE_MODE=mock` w Preview, bez kluczy produkcji);
  - „Preview deployments: None” albo tylko wybrane gałęzie;
  - Cloudflare Access (logowanie) dla `*.wawis.pages.dev`.
- **W obu wariantach:** sprawdzić w Supabase → Authentication → URL Configuration listę *Redirect URLs* — ma zostać tylko adres produkcyjny Vercel.

**Moja część:**

- dopisanie do `scripts/vercel-deploy-guard.cjs` jawnego zatrzymania buildu poza Vercel (np. gdy `CF_PAGES=1`), żeby żaden przyszły build Cloudflare nie wytworzył działającej aplikacji. To zmiana bramki wdrożenia, więc wymaga zgody;
- po zmianach sprawdzenie, że check „Cloudflare Pages” zniknął z PR-ów albo że podgląd pokazuje tryb atrapy.

**Kryteria gotowości:**

- brak publicznych buildów z danymi produkcji (zrzut ustawień + brak checku lub podgląd w trybie atrapy);
- lista Redirect URLs bez `pages.dev`;
- wpis w `CLAUDE.md` zaktualizowany.

**Ryzyko:** niskie dla Vercel. Jedyne ryzyko: jeśli ktoś faktycznie używa `wawis.pages.dev`, przestanie działać — dlatego najpierw sprawdzenie, potem decyzja.

---

## 5. Etap E3 — modernizacja testów

### 5.1. Cel

Test ma uruchamiać prawdziwy kod i sprawdzać wynik działania, a nie tekst źródła. Dziś 209 z 267 skryptów smoke czyta tylko kod (regex), E2E działają wyłącznie w Chromium na atrapie Supabase, a WebKit nie jest używany.

### 5.2. Docelowa piramida testów

| Warstwa | Narzędzie | Co sprawdza | Gdzie |
|---|---|---|---|
| 1. Logika | **Vitest** (szybkie testy jednostkowe w Node) | Czyste funkcje: odczyt i porównanie SN, rozbicie urządzeń JW/JZ, uprawnienia, walidacje, konflikty offline (z atrapą klienta), kolejka zdjęć (z `fake-indexeddb`) | CI, każdy PR, ~1 min |
| 2. Baza i uprawnienia | **Lokalny Supabase w CI** (`supabase start` w Dockerze) + schemat z kopii E1 | RLS jako administrator / pracownik / oczekujący; RPC (`save_job_concurrent_v1168`, kasowanie, kosz); trigger plików 0 B; polityki Storage | CI dla zmian SQL, uprawnień i zdjęć |
| 3. Aplikacja w przeglądarce | **Playwright na zbudowanej aplikacji**, projekty **Chromium + WebKit** (profil iPhone 14) | Pełne przepływy: zdjęcie → kadr → zapis; tabliczka offline/online; protokół z podpisem → PDF w Storage; status offline → synchronizacja; aktualizacja wersji A → B → praca offline | CI dla zmian mobilnych |
| 4. Fizyczny iPhone | Krótka lista testowa (10–15 min) + kontrola w bazie | To, czego WebKit na Linuksie nie odtwarza: Safari na iOS, PWA na ekranie głównym, aparat, tło, pamięć | Przed udostępnieniem wszystkim: wydania dotykające zdjęć, offline, service workera, protokołu |
| 5. Po wdrożeniu | Workflow: odczyt `/app-version.json` + mój przegląd telemetrii pierwszej godziny | Czy wersja faktycznie działa i czy nie przybyło błędów | Po każdym wdrożeniu |

**Uwaga o WebKit:** Playwright WebKit na Linuksie to ten sam silnik co Safari, ale nie Safari na iOS. Wykrywa część błędów (IndexedDB, Blob, service worker, układ), ale nie wszystkie — błąd 0 B z 13.42–13.64 mógł być specyficzny dla iOS. Dlatego warstwa 4 zostaje obowiązkowa dla ryzykownych zmian.

**Opcjonalnie (koszt, decyzja właściciela):** chmura z prawdziwymi iPhone'ami (np. BrowserStack Automate — Safari na iOS przez WebDriver), ok. 30–40 USD/mies. To automatyczny test 2–3 kluczowych przepływów na prawdziwym iPhonie w CI. Rekomenduję rozważyć po E3, jeśli lista ręczna okaże się uciążliwa.

### 5.3. Kolejność wdrażania testów (bez blokowania pracy)

1. **E3-a: WebKit w CI dla istniejących E2E mobilnych.**
   - Projekt `webkit-iphone` w `playwright.built.config.js` i `playwright.nameplate-built.config.js` (zdjęcia, tabliczki, offline).
   - Najpierw jako check informacyjny; po tygodniu stabilnych wyników — wymagany.
   - Ryzyko: wykrycie istniejących błędów WebKit (to dobrze — trafiają do backlogu).
2. **E3-b: Vitest + przeniesienie testów logiki.**
   - Zaczynam od modułów krytycznych: `nameplate-serial-verification`, `nameplate-reader` (kandydaci offline), `job-devices`, `job-offline-sync`, `photo-offline-queue` (`fake-indexeddb`), `jobPermissions` (desktop i mobile — test tej samej tabeli przypadków dla obu kopii wykrywa rozjazd).
   - Każdy nowy test wykonuje kod.
   - **Zasada:** testy tekstowe (regex) zostają tylko jako strażnicy konfiguracji (`vercel.json`, bramki). Nie są dowodem dla zmian TARGETED/CRITICAL, zgodnie z `CLOSURE-GATE.md`.
3. **E3-c: schemat produkcji w repozytorium** (P1-3), z kopii E1 (`pg_dump --schema-only`). Plik `supabase/schema-baseline.sql` jest źródłem prawdy, a każda następna zmiana bazy idzie jako migracja.
4. **E3-d: lokalny Supabase w CI** na bazowym schemacie, z testami RLS dla trzech ról i testami Storage. Atrapa (`mockSupabaseClient.js`) zostaje dla szybkich E2E, ale krytyczne przepływy przechodzą też przez prawdziwy Supabase.
5. **E3-e: test aktualizacji.** Dwie kompilacje (wersja A i B) w jednym teście:
   - A instaluje service worker i dane;
   - B się aktualizuje;
   - wyłączenie sieci;
   - otwarcie montażu, formularza, protokołu i Diagnostyki.

   Ten test jest warunkiem etapu E4.
6. **E3-f: wymagane checki.** Po stabilizacji: `built-photo-queue-e2e`, `built-nameplate-e2e` i WebKit jako wymagane w rulesecie `main` (zgoda właściciela — ustawienia GitHub).

**Kryteria gotowości E3:**

- WebKit i Vitest działają w CI na każdym PR mobilnym;
- test aktualizacji A → B → offline istnieje i pokazuje obecny stan (oczekuję, że na dziś nie przejdzie — to dowód problemu P1-1);
- schemat bazowy w repozytorium zgodny z produkcją (porównanie listy tabel, polityk i funkcji);
- czas CI dla PR mobilnego ≤ 20 min.

**Ryzyko:** niskie. Zmieniam tylko CI i testy, aplikacja bez zmian, więc bez wdrożeń produkcyjnych w tym etapie.

---

## 6. Etap E4 — praca offline: kompletność aplikacji po aktualizacji

**Problem (P1-1):** service worker kasuje cache poprzedniej wersji przy aktywacji. Pliki ekranów ładowanych „na żądanie” (szczegóły montażu, formularz, Diagnostyka…) trafiają do cache dopiero przy pierwszym otwarciu z internetem. Po aktualizacji rano i wyjeździe na budowę bez zasięgu aplikacja może nie otworzyć montażu.

**Rozwiązanie:**

1. **Precache całej wersji przy instalacji service workera.**
   - Build Vite generuje manifest (`build.manifest: true`), a skrypt po buildzie zapisuje listę plików wersji do `public/precache-manifest.json` (z sumami).
   - Instalacja nowego service workera pobiera wszystkie pliki z listy (dziś ok. kilku MB).
   - **Jeśli pobranie się nie uda, instalacja kończy się błędem** — telefon zostaje przy starej, kompletnej wersji, zamiast przejść na niekompletną nową. Dziś `Promise.allSettled` przepuszcza niekompletną instalację.
   - Stary cache jest kasowany dopiero po pełnej instalacji nowego (obecny mechanizm `activate`, ale po kompletnym precache).
   - Cache czytników tabliczek (`wawis-nameplate-readers-v1`) zostaje bez zmian.
2. **Aktualizacja tylko w bezpiecznym momencie.** Dzisiejszy `skipWaiting()` przejmuje stronę od razu. Nowa wersja ma czekać do braku otwartych formularzy — mechanizm `update-reload-guard` już istnieje, więc trzeba go spiąć z service workerem.
3. **Lokalne bazy bez numeru wersji przy otwieraniu.**
   - `wawis-mobile-offline-data` (dziś `open(name, 2)`) i `wawis-app-read-cache` (`open(name, 1)`) otwierać jak kolejkę zdjęć: bez numeru i z kontrolą magazynów.
   - Dzięki temu cofnięcie wersji nigdy nie skończy się błędem `VersionError` (lekcja z 13.42–13.62). To również warunek bezpiecznej procedury wycofania (sekcja 8).
4. **Wskaźnik „Gotowe do pracy offline” w Diagnostyce:**
   - wersja kompletna w cache;
   - czytniki tabliczek zapisane;
   - lokalne bazy czytelne.

   Monter widzi to zielone przed wyjazdem.

**Testy:**

- E3-e (A → B → offline) w Chromium i WebKit;
- test „nieudany precache = zostaje stara wersja”;
- test otwarcia lokalnych baz utworzonych przez nowszą wersję w starszym kodzie;
- iPhone: tryb samolotowy po aktualizacji → montaż, formularz, protokół (podgląd), Diagnostyka.

**Kryteria gotowości do wdrożenia:**

- wszystkie testy zielone w Chromium i WebKit;
- test na jednym iPhonie (administrator) przed resztą;
- telemetria: brak błędów ładowania modułów (`ChunkLoadError` / „Failed to fetch dynamically imported module”) przez 2 dni.

**Ryzyko:** średnie (service worker to obszar chroniony; błąd może zatrzymać aktualizacje). Ograniczenie ryzyka:

- najpierw jeden telefon;
- gotowa procedura wycofania;
- `push-sw.js` zachowuje obsługę powiadomień bez zmian (osobny test PUSH).

---

## 7. Etap E5 — ochrona podpisu klienta (do decyzji, bez zmiany funkcjonalności protokołu)

Zgodnie z poleceniem nie zmieniam teraz zasady „protokół zapisuje się z internetem”. Proponuję dwa poziomy do omówienia.

**Poziom 1 — „nie zgubić podpisu” (moja rekomendacja na start; nie zmienia funkcjonalności zapisu):**

1. **Przed podpisem, gdy nie ma internetu:** komunikat „Brak internetu — protokół zapisze się dopiero po powrocie zasięgu. Nie zamykaj okna.”
2. **Podpis i formularz chronione przed przypadkowym zamknięciem:**
   - zamknięcie okna z niezapisanym podpisem pyta o potwierdzenie;
   - aktualizacja aplikacji nie przeładuje strony w trakcie (`update-reload-guard`).
3. **Szkic podpisu w pamięci aplikacji do czasu zapisu,** jak szkic urządzeń w 13.68. Ponowne otwarcie protokołu w tym samym montażu przywraca podpis z informacją „Podpis klienta z <godzina> — sprawdź dane i zapisz”. Zabezpieczenie: szkic ważny tylko dla tych samych danych montażu (snapshot), inaczej wymaga nowego podpisu.
4. **Automatyczna próba zapisu po powrocie internetu,** gdy okno jest otwarte.

Ryzyko: niskie–średnie. Testy: E2E offline → podpis → zamknięcie → ponowne otwarcie → internet → zapis (Chromium, WebKit, iPhone).

**Poziom 2 — „protokół offline” (zmiana funkcjonalności, decyzja biznesowa):**

- gotowy PDF i podpis zapisane w pamięci telefonu (IndexedDB) i wysłane automatycznie po powrocie sieci, ze statusem „Protokół czeka na wysłanie”;
- to ta sama klasa ryzyka co offline zdjęć (Safari i IndexedDB), które wyłączyliśmy w 13.66;
- przed decyzją proponuję zebrać, jak często monterzy podpisują bez zasięgu (zdarzenie w telemetrii przy otwarciu protokołu offline — można dodać w poziomie 1).

---

## 8. Procedura cofnięcia wadliwego wdrożenia

### 8.1. Kiedy cofać

- Monterzy nie mogą wykonywać podstawowej pracy: logowanie, lista montaży, status, zdjęcie, tabliczka, protokół.
- Telemetria nowej wersji pokazuje błędy `error` u więcej niż jednej osoby albo pętlę przeładowań.
- Zagrożenie danych: zapisy pustych plików, nadpisywanie, znikanie rekordów. **W tym przypadku najpierw zatrzymanie, potem diagnoza.**

### 8.2. Dwie drogi

**Droga A — natychmiastowa (minuty), gdy monterzy nie mogą pracować:**

1. **Vercel → Deployments → ostatnie dobre wdrożenie → „Instant Rollback” / „Promote to Production”.**
   - Robi to właściciel, bo nie mam dostępu do zespołu Vercel.
   - Proponuję jednorazowo dodać moje konto do zespołu, żeby skrócić czas reakcji (decyzja właściciela).
2. Telefony przy najbliższym otwarciu lub powrocie z tła (`pageshow` / `focus` / `online`) wykryją inną wersję w `/app-version.json` i się przeładują.
3. Kontrola:
   - `/app-version.json` = poprzednia wersja;
   - telemetria: urządzenia zgłaszają poprzednią wersję;
   - brak nowych błędów.

**Droga B — standardowa (godzina), zawsze po drodze A albo zamiast niej:**

1. PR „cofnięcie” jako **nowa wersja** (np. 13.71 z kodem 13.70 minus wadliwa zmiana).
   - Normalne CI i Closure Gate.
   - Numer wersji zawsze rośnie, nigdy nie wraca.
2. Scalenie i wdrożenie, aby `main` znów był źródłem prawdy. Po drodze A następne scalenie do `main` i tak nadpisałoby cofnięcie.

### 8.3. Dane lokalne PWA przy cofaniu — zasady

| Element | Zachowanie przy cofnięciu | Warunek bezpieczeństwa |
|---|---|---|
| Service worker | Starszy `push-sw.js` instaluje się jak każda zmiana. `activate` kasuje cache nowszej wersji (`wawis-app-shell-v13.xx`) i zostawia `wawis-nameplate-readers-v1`. | Starszy kod musi obsługiwać PUSH w tym samym formacie — sprawdzić w teście przed cofnięciem (zmiany formatu PUSH wymagają zgodności wstecznej). |
| `wawis-mobile-photo-queue` (zdjęcia) | Od 13.62 otwierana bez numeru wersji — działa z v3 i v4 (wstrzymane rekordy). | **Nie cofać poniżej 13.62** (starsze otwierają bazę z numerem i dostają `VersionError` przy v4). |
| `wawis-mobile-offline-data` (statusy, komentarze, szkice) | Dziś otwierana z numerem 2. Każde przyszłe podniesienie wersji tej bazy zablokuje cofnięcie poniżej tej wersji. | Etap E4 pkt 3: otwieranie bez numeru. Do tego czasu: zakaz podnoszenia wersji tej bazy. |
| `wawis-app-read-cache` (podręczne dane) | Odczyt podręczny, wersja 1. | Jak wyżej. |
| `localStorage` (status czytników, ustawienia) | Starszy kod ignoruje nieznane klucze. | Klucze tylko dodawane, nigdy zmieniany format istniejących. |
| Szkic urządzeń (13.68) | Tylko w pamięci, ginie przy przeładowaniu. | Przed cofnięciem komunikat do monterów: „zapisz otwarte formularze”. |
| Baza Supabase | Wdrożenie frontendu nie zmienia bazy. | **Zasada zgodności wstecznej:** zmiany bazy tylko dodające (expand), usuwanie starych kolumn i funkcji dopiero po 2 wydaniach (contract). Cofnięcie bazy = kopia (E1) — ostateczność, decyzja właściciela. |

**Czego nigdy nie robimy przy cofaniu:**

- zdalne czyszczenie IndexedDB lub cache telefonów w kodzie;
- obniżanie numeru wersji lokalnych baz;
- usuwanie niewysłanych danych bez decyzji użytkownika (przycisk „Usuń stare zdjęcia” zostaje decyzją pracownika).

### 8.4. Przygotowanie (zrobię w E0 i E4, bez wdrożenia)

- Plik `docs/PROCEDURA-WYCOFANIA.md` z krokami A i B oraz zrzutami ekranu Vercel (do uzupełnienia z właścicielem).
- Tabela zgodności lokalnych baz w `docs/` (nazwa, wersja, od kiedy, minimalna wersja aplikacji do cofnięcia).
- Test CI „baza utworzona przez nową wersję → otwarta przez poprzednią” (E3/E4).
- **Minimalna wersja do cofnięcia: 13.62.** Zalecana pewna wersja do szybkiego cofnięcia: **13.67** (ostatnia przed zmianami okien i czytników), po potwierdzeniu w E0, że działa u monterów.

---

## 9. Etap E6 — integralność zdjęć historycznych (P1-5)

1. Raport (tylko `SELECT`): 6 montaży z pustymi plikami (data, klient, pole zdjęcia), 30 plików bez rekordu (rozmiar, data). Dla właściciela, bez danych w repozytorium.
2. **Decyzja właściciela:** ponowne zdjęcia przy najbliższym przeglądzie albo pozostawienie.
3. **Zmiana w aplikacji (po decyzji):** puste zdjęcie oznaczone „Zdjęcie uszkodzone — dodaj ponownie” zamiast pustej miniatury. Bez zmiany danych.
4. Pliki bez rekordu: najpierw do kopii E1; usunięcie tylko po zgodzie.

**Kryterium:** raport przekazany, decyzja zapisana. **Ryzyko:** niskie.

---

## 10. Podsumowanie zależności i zgód

| Etap | Wymaga zgody / działania właściciela | Mogę wykonać samodzielnie |
|---|---|---|
| E0 | Udział Pawła i Kacpra | Kontrola telemetrii, `SELECT`, aktualizacja dokumentacji |
| E1 | Wybór magazynu, sekrety, zgoda na zaplanowany workflow | Workflow, skrypty, szyfrowanie, próba odtworzenia, procedura |
| E2 | Sprawdzenie i zmiana ustawień Cloudflare oraz Redirect URLs | Weryfikacja; zmiana `vercel-deploy-guard` (po zgodzie — bramka wdrożenia) |
| E3 | Ustawienie wymaganych checków w GitHub (na końcu) | Całość testów i CI |
| E4 | — (standardowy GO) | Całość, z testem na jednym iPhonie przed resztą |
| E5 | Decyzja: poziom 1 / poziom 2 | Po decyzji całość |
| E6 | Decyzja o zdjęciach i plikach | Raport, oznaczenie w UI |

**Czego nie robię bez osobnej decyzji:**

- zmiana widoczności montaży dla pracowników;
- protokół offline;
- usuwanie jakichkolwiek danych lub plików w Supabase;
- zmiany RLS, Storage, sekretów;
- zmiany ustawień GitHub, Vercel i Cloudflare.

**Szacowany czas:**

- E0 — 1 dzień;
- E1 — 1–2 dni pracy (plus czas na konta właściciela) i 7 dni obserwacji;
- E2 — 1 godzina po stronie właściciela;
- E3 — 3–5 dni;
- E4 — 2–3 dni + 2 dni obserwacji;
- E5 poziom 1 — 1–2 dni;
- E6 — pół dnia.
