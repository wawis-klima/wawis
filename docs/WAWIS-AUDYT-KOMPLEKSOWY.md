# WAWIS Klimatyzacja — kompleksowy audyt aplikacji

**Data:** 25.10.2026 · **Wersja produkcyjna w chwili audytu:** 13.70 (potwierdzona telemetrią: telefon administratora zgłasza 13.70 o 17:00 UTC) · **Autor:** Claude (główny programista WAWIS) · **Tryb:** audyt — bez zmian produkcji, bez zapisu do Supabase.

---

## 0. Zakres, metoda i ograniczenia

**Co sprawdziłem samodzielnie:**

- **Repozytorium:**
  - struktura i rozmiar: 258 plików JS/JSX, ok. 64 tys. linii w `src/`, 27,7 tys. linii CSS;
  - historia `main` od 1.10.2026: 173 commity;
  - zasady: `CLAUDE.md`, `AGENTS.md`, `WAWIS-RULES.md`, `CLOSURE-GATE.md`, `MAIN-PROTECTION.md`, `REGRESSION-LEDGER.md`, wcześniejsze audyty w `docs/audits/`.
- **Supabase produkcyjny — wyłącznie zapytania `SELECT` i doradcy Supabase:**
  - polityki RLS wszystkich tabel i Storage;
  - funkcje `SECURITY DEFINER` (uprawnienia, `search_path`, kontrola roli);
  - trigger ochrony ról, buckety i spójność plików zdjęć;
  - migracje (porównanie produkcja ↔ repozytorium);
  - Edge Functions (`verify_jwt`, uwierzytelnianie w kodzie);
  - telemetria `app_diagnostic_events`, `push_delivery_log`, `push_subscriptions`, `sms_log`.
- **GitHub:** ruleset `main`, workflowy, przebiegi CI z ostatnich wydań.
- **Kod krytycznych przepływów:**
  - kolejka zdjęć i upload;
  - synchronizacja offline;
  - zapis montażu (CAS), zapis protokołu;
  - service worker i aktualizacje, odczyt tabliczek;
  - endpointy AI (`api/`), Edge Functions.
- **Testy:** klasyfikacja 267 skryptów smoke, 39 specyfikacji Playwright, konfiguracje i bramki CI.

**Czego NIE mogłem sprawdzić (nie zgaduję):**

- **Cloudflare Pages:** brak dostępu do panelu, a podglądy `*.wawis.pages.dev` są poza listą adresów, które mogę otworzyć. Nie wiem, czy podglądy łączą się z produkcyjnym Supabase. Status: **NIEZWERYFIKOWANE**.
- **Vercel:** brak dostępu do zespołu `wawis` (zmienne środowiskowe, logi buildów, ustawienia aliasów). Wiem tylko, co raportuje GitHub (status deploymentu) i co zwraca `/app-version.json`.
- **Plan Supabase i kopie bazy (PITR / dzienne backupy):** brak wglądu w ustawienia projektu.
- **Fizyczne iPhone'y:** testy pracowników Pawła i Kacpra zaplanowane na 26.10.2026. **Nie traktuję ich jako wykonanych.**
- **Build produkcyjny lokalnie:** w środowisku audytu nie ma `node_modules` ani dostępu do npm. Rozmiaru paczki nie zmierzyłem.

**Oznaczenia pewności:** **POTWIERDZONE** (dowód w kodzie lub danych), **PRAWDOPODOBNE** (mechanizm potwierdzony w kodzie, brak obserwacji na produkcji), **HIPOTEZA** (wymaga sprawdzenia).

---

## 1. Najważniejsze wnioski

1. **Fundament bezpieczeństwa danych jest dobry:**
   - RLS na każdej tabeli;
   - wszystkie funkcje `admin_*` sprawdzają rolę i mają ustawiony `search_path`;
   - trigger blokuje samodzielną zmianę roli, a nowe konto dostaje rolę „Oczekujący”;
   - Edge Functions bez JWT mają własne tokeny lub sekrety.

   Nie znalazłem luki pozwalającej obcej osobie odczytać dane.
2. **Największe ryzyko to tempo wydań.** Od 13.25 do 13.70 minęło 7 dni. W 3 dni (21–23.10) do `main` trafiło ok. 150 commitów. Telefon administratora widział 38 wersji w tydzień. Każde wydanie było „zielone”, a mimo to kolejne naprawiały poprzednie (incydent zdjęć 13.42–13.70).
3. **W poniedziałek 4 telefony pracowników przeskoczą z 13.28–13.55 prosto na 13.70.** Ostatnie zgłoszenia telemetrii pracowników były 20–23.10. Ten skok obejmuje wszystkie zmiany kolejki zdjęć, IndexedDB, tabliczek i service workera. Żadna z tych wersji nie była testowana na iPhonie pracownika. **P0 (ryzyko operacyjne).**
4. **Po każdej aktualizacji aplikacja może nie otworzyć części ekranów bez internetu.** Service worker przy aktywacji kasuje cache poprzedniej wersji. Moduły ładowane „na żądanie” (m.in. szczegóły montażu, formularz montażu) trafiają do cache dopiero przy pierwszym otwarciu online. Potwierdził to mój test E2E 13.70: przy prawdziwym offline przycisk „Tabliczki” nie pojawił się, dopóki ekranu nie otwarto wcześniej z internetem. **P1.**
5. **Testy dają częściowo fałszywe poczucie bezpieczeństwa:**
   - **209 z 267 (78%)** skryptów smoke tylko czyta tekst kodu źródłowego (regex) i nie wykonuje logiki;
   - wszystkie E2E działają na atrapie Supabase w Chromium;
   - nie ma testów WebKit/Safari, choć wszyscy użytkownicy mobilni mają iPhone'y.
6. **Repozytorium nie odtworzy schematu produkcyjnego:**
   - z 117 migracji produkcji tylko 41 ma odpowiednik (tę samą sygnaturę czasu) w repozytorium;
   - 76 istnieje tylko na produkcji, a 53 pliki z repozytorium nie zostały zastosowane pod tą samą sygnaturą;
   - do tego 57 luźnych plików `.sql` w katalogu głównym.

   Odtworzenie bazy po awarii z samego repozytorium jest niepewne. **P1.**
7. **Kopie zapasowe zdjęć i protokołów nie działają.** Funkcja `backup-storage-assets` jest w repozytorium, ale nie jest wdrożona, a w bazie nie ma tabel jej kolejki. Kopie bazy zależą od planu Supabase, którego nie widzę. **P1.**
8. **Integralność zdjęć:**
   - 6 rekordów zdjęć (lipiec–wrzesień 2026) wskazuje na pliki 0 B (niewidoczne zdjęcia w dokumentacji);
   - 30 plików w Storage nie ma rekordu.

   Nowe zdjęcia (12–25.10) są poprawne: 0 plików pustych. **P1 (dane historyczne).**
9. **Podwójna aplikacja.** `src/` (desktop, ok. 32,5 tys. linii) i `src/mobile791/` (mobile, ok. 31,3 tys.) to dwa rozjechane forki: 80 plików o tych samych nazwach. Na przykład `jobPermissions.js` różni się o 32 linie, a `photos.js` ma 443 linie na desktopie i 1879 w wersji mobilnej. Każda poprawka logiki biznesowej wymaga dwóch zmian. **P2.**
10. **Działa dobrze i nie wymaga zmian:**
    - zapis montażu z kontrolą konfliktów (`save_job_concurrent_v1168`);
    - synchronizacja statusu offline z wykrywaniem konfliktów;
    - zapis protokołu z uzgadnianiem wyniku po utracie odpowiedzi;
    - PUSH: 24 z 24 ostatnich przypisań odebranych na telefonach.

---

## 2. Mapa modułów

| Moduł | Cel | Jak działa (kod + dane) | Zależności | Ocena |
|---|---|---|---|---|
| Montaże i statusy | Lista, edycja, statusy Nowe → W trakcie → Zakończone / Niezrealizowane | 163 montaże (155 zakończonych). Edycja przez RPC `save_job_concurrent_v1168` z porównaniem stanu (CAS). Zakończenie offline czeka na zapis tabliczek. | Kontrahenci, urządzenia, zdjęcia, protokół, PUSH | Dobre. Uwaga: RLS pozwala każdemu pracownikowi czytać i edytować każdy niezakończony montaż (P2-4). |
| Kontrahenci | Baza klientów (1347) | Zapis tylko przez admina (RLS). Pracownik tworzy klienta przez RPC z deduplikacją po telefonie, e-mailu i nazwie. NIP: pracownik może uzupełnić, nie może zmienić. | GUS BIR, kody pocztowe, Fakturownia | Dobre. Deduplikacja po nazwie może scalić dwóch różnych klientów o tej samej nazwie (P3). |
| Urządzenia, JW/JZ | Ewidencja jednostek, numery seryjne, przeglądy | Pola `device_model` i `device_serial_number` w `jobs` (tekst wieloliniowy) oraz tabela `devices` (743) synchronizowana triggerem. | Montaże, tabliczki, SMS przeglądowe | Model danych „tekst w jobs + kopia w devices” jest kruchy. Panel Urządzeń zapisuje bez CAS (P2-1). |
| Tabliczki: OCR i AI | Odczyt modelu i SN ze zdjęcia | Lokalnie EAN-13, Code 128 (barcode-detector/zxing z jsDelivr) i Tesseract (`/ocr`); przy niepewności AI (`/api/read-nameplate-ai`, uwierzytelnione). 13.69–13.70: tryb bez internetu, czytniki w trwałym cache. | Zdjęcia, katalog EAN | Rozbudowane i ostrożne (obowiązkowe sprawdzenie SN). Niezweryfikowane na iPhonie (P0-1). |
| Zdjęcia | Dokumentacja montażu | Od 13.66 tylko online: 3 próby, wysyłka bajtów (obejście błędu Safari). Stara kolejka IndexedDB zostaje dla starych rekordów. 993 zdjęcia, 496 MB. | Storage, RLS, protokół | Działa (0 pustych plików od 12.10). Kod obciążony warstwami 13.42–13.70 (P2-2). |
| Synchronizacja offline | Statusy i komentarze bez sieci | `job-offline-store` + `job-offline-sync`: dzierżawy, ponawianie, konflikt bez nadpisywania. | Montaże, tabliczki | Dobra konstrukcja. Ryzyko: ekrany niedostępne offline po aktualizacji (P1-1). |
| Protokoły | PDF z podpisem klienta, e-mail | Wymaga internetu. Podpis w pamięci formularza. Zapis z `replaceExisting` + `expectedStoragePath` i uzgadnianiem wyniku. 51 PDF-ów. | Montaże, płatność, e-mail (Edge) | Solidny zapis. Ryzyko biznesowe: brak zasięgu u klienta (P1-4). |
| Fakturownia | Faktury VAT | Edge Function `fakturownia-client` (JWT), RPC `admin_confirm_*`. Tabela prób bez polityk = dostęp tylko z serwera. | Kontrahenci, montaże | Bez uwag krytycznych. |
| PUSH | Przypisania, zakończenia, podpisy | Edge Functions z tokenami zdarzeń. Potwierdzenia odbioru: 24 z 24 `job_assigned` odebrane, 16 wyświetlonych (14 dni). | Service worker, profile | Dobrze. 73 wpisy subskrypcji administratora (3 aktywne) — zaśmiecanie (P3). |
| SMS (SMSAPI) | Przypomnienia o przeglądach | Kolejka, claim/retry, webhook z tokenem i porównaniem w stałym czasie. 80 doręczonych w 30 dni. | Urządzenia, kontrahenci | Najlepiej przetestowany moduł (testy dwusesyjne PostgreSQL). |
| Kalendarz | Planowanie | Widok danych montaży. | Montaże | Bez uwag. |
| Paliwo | Tankowania, licznik | RLS „własne lub admin”. OCR i AI licznika. Tabele prawie puste. | Pojazdy, Storage | Moduł mało używany. Bez uwag bezpieczeństwa. |
| Użytkownicy i role | Administrator / Pracownik | Trigger `guard_profile_role`, nowe konta „Oczekujący”. 5 kont. | Wszystko | Dobre. Niespójne nazwy ról w SQL (`admin`, `Administrator`, `employee`, `Pracownik`) (P3). |
| Diagnostyka | Telemetria i naprawy | `app_diagnostic_events` (ok. 3,8 tys.), raport, „Synchronizuj teraz”, „Napraw kolejkę”. | Wszystko | Przydatna, ale 491 + 135 + 87 zdarzeń tygodniowo ma kod `DIAGNOSTIC_UNCLASSIFIED` (P2-6). |
| Interfejs mobile / desktop | Dwie aplikacje | Dwa drzewa kodu (forki), wspólny backend. | — | Główne źródło kosztu utrzymania (P2-3). |

---

## 3. P0 — krytyczne

### P0-1. Skok pracowników z 13.28–13.55 na 13.70 bez testu na iPhonie i bez planu wycofania
- **Opis:** telemetria pokazuje ostatnie wersje pracowników: 13.55 (23.10), 13.38 (23.10), 13.36 (21.10), 13.28 (20.10). Przy następnym otwarciu aplikacja sama przeładuje się do 13.70 (`checkLiveVersion` w `src/main.jsx`). Między tymi wersjami zmieniły się:
  - kolejka zdjęć i zgodność baz IndexedDB v3/v4 (13.42–13.65);
  - zasada „zdjęcia tylko online” (13.66);
  - okna bez internetu i szkice (13.67–13.68);
  - odczyt tabliczek offline i nowy cache service workera (13.69–13.70).
- **Dowód:** zapytanie do `app_diagnostic_events` (ostatnia wersja na użytkownika); `CHANGELOG.md` 13.42–13.70; testy wyłącznie Chromium (`playwright*.config.js`, brak WebKit w CI).
- **Wpływ:** jeśli coś zadziała na Safari inaczej niż w Chromium, cały zespół trafi na to jednocześnie, w dzień pracy.
- **Pewność:** POTWIERDZONE (fakty o wersjach). Skutek: HIPOTEZA.
- **Rozwiązanie:**
  1. **Zamrożenie wydań na poniedziałek** — tylko poprawki błędów zgłoszonych z telefonów.
  2. Rano jeden pracownik (Paweł) przechodzi listę z `docs/iphone-test-v1362.md`, rozszerzoną o tabliczkę offline (13.70). Dopiero potem reszta.
  3. Przygotowana instrukcja wycofania: ponowne wypromowanie deploymentu 13.62 lub 13.67 w Vercel. Wymaga dostępu właściciela do Vercel.
- **Ryzyko poprawki:** brak (to procedura, nie kod). **Priorytet:** natychmiast.

*Nie znalazłem błędu technicznego klasy P0 (wycieku danych, utraty danych w toku). Jedynym P0 jest powyższe ryzyko operacyjne.*

---

## 4. P1 — ważne

### P1-1. Po aktualizacji ekrany ładowane „na żądanie” nie otworzą się bez internetu
- **Lokalizacja:**
  - `public/push-sw.js`: `activate` kasuje `wawis-app-shell-*` poprzedniej wersji; `fetch` zapisuje do cache tylko pobrane zasoby;
  - `src/mobile791/App.jsx`: 11 modułów przez `lazy()`, m.in. `JobDetailsPanel`, `JobFormModal`, `MobileDiagnosticsPanel`;
  - `src/main.jsx`: `WAWIS_CACHE_LOADED_ASSETS` zapisuje tylko zasoby już załadowane.
- **Dowód:** w teście `mobile-nameplate-offline-readers-v1370` pierwsza wersja testu (otwieranie montażu po `context.setOffline(true)`) nie znalazła przycisku „Tabliczki” (timeout 240 s, przebieg CI z 25.10). Test przeszedł dopiero po otwarciu ekranów z internetem.
- **Wpływ:** pracownik zaktualizował aplikację rano (online), a na budowie bez zasięgu nie otworzy szczegółów montażu ani formularza.
- **Pewność:** PRAWDOPODOBNE dla iPhone'ów (mechanizm potwierdzony w Chromium).
- **Rozwiązanie:**
  - przy instalacji service workera zapisać w cache wszystkie pliki z manifestu builda Vite (`build.manifest: true`) — wtedy każda wersja jest kompletna offline;
  - albo usunąć `lazy()` dla modułów mobilnych używanych w terenie.
- **Ryzyko poprawki:** średnie (service worker, obszar chroniony). Wymagany test E2E „aktualizacja → offline → otwórz montaż / formularz / protokół”.

### P1-2. Brak działającej kopii zapasowej zdjęć i protokołów; stan kopii bazy nieznany
- **Lokalizacja:** `supabase/functions/backup-storage-assets/` (w repozytorium od 13.26, niewdrożona); w produkcji brak tabeli kolejki kopii. Lista funkcji Edge (12 aktywnych) jej nie zawiera.
- **Dowód:** `list_edge_functions`; `pg_class` (brak tabel `*backup*` poza jednorazowymi kopiami kodów pocztowych).
- **Wpływ:** 496 MB zdjęć i 51 protokołów (dowody wykonania usług, podpisy klientów) istnieje w jednym miejscu. Polityki usuwania są ostrożne, ale kopii poza Supabase nie ma.
- **Pewność:** POTWIERDZONE (Storage). Baza: NIEZWERYFIKOWANE (plan Supabase).
- **Rozwiązanie:**
  1. Właściciel sprawdza w Supabase plan i kopie (Settings → Database → Backups). Rozważyć PITR.
  2. Cotygodniowa kopia Storage, np. eksport do Google Drive lub drugiego bucketu przez zaplanowane zadanie. Decyzja i sekrety po stronie właściciela.
- **Ryzyko poprawki:** niskie (nowy mechanizm tylko do odczytu). **Wymaga zgody właściciela** (sekrety, Edge Functions).

### P1-3. Schemat produkcji nie jest odtwarzalny z repozytorium
- **Lokalizacja:**
  - `supabase/migrations/` (73 pliki w katalogu głównym, 45 w `archive`, 37 w `current`);
  - `supabase/rebuild/` (21);
  - 57 plików `*.sql` w katalogu głównym repozytorium.
- **Dowód:** `supabase_migrations.schema_migrations` ma 117 wersji. Z nich 41 występuje w repozytorium pod tą samą sygnaturą czasu, 76 nie występuje. W repozytorium jest 53 sygnatur, których produkcja nie ma.
- **Wpływ:** odtworzenie bazy po awarii lub zbudowanie środowiska testowego z prawdziwym schematem jest ręczne i niepewne. Testy E2E używają atrapy, więc rozjazdu nikt nie wykryje.
- **Pewność:** POTWIERDZONE.
- **Rozwiązanie:**
  1. Jednorazowy zrzut schematu produkcji (`pg_dump --schema-only`, tylko odczyt) jako `supabase/schema-baseline-2026-10.sql`.
  2. Od tej chwili każda zmiana bazy jako migracja w repozytorium z tą samą sygnaturą co na produkcji.
  3. Luźne pliki SQL przenieść do `supabase/legacy/` z opisem.
- **Ryzyko poprawki:** niskie (dokumentacja i porządek; zero zmian produkcji).

### P1-4. Protokół wymaga internetu; podpis klienta żyje tylko w otwartym oknie
- **Lokalizacja:**
  - `src/mobile791/modules/job-protocol-storage.js` (`storeJobProtocol`: „Do zapisania protokołu potrzebne jest połączenie z internetem”);
  - `ProtocolTestModal.jsx` (podpis w stanie formularza).
- **Wpływ:** u klienta bez zasięgu podpis nie zostanie zapisany. Zamknięcie okna lub aplikacji wymusza ponowny podpis.
- **Pewność:** POTWIERDZONE (kod). Częstość: nieznana.
- **Rozwiązanie (po decyzji właściciela):** zapis gotowego PDF i podpisu w pamięci telefonu i automatyczna wysyłka po powrocie sieci, z widocznym statusem „Protokół czeka na wysłanie”. Alternatywa: jasny komunikat przed podpisem „brak internetu — podpis nie zostanie zapisany”.
- **Ryzyko poprawki:** wysokie (IndexedDB na iPhonie — ta sama klasa problemów co zdjęcia). Najpierw decyzja biznesowa.

### P1-5. Zdjęcia historyczne: 6 rekordów wskazuje na puste pliki (0 B)
- **Dowód:**
  - `storage.objects` (bucket `job-photos`): 13 obiektów o rozmiarze 0 B (29.07–18.09.2026), z czego 6 jest powiązanych z rekordami `photos`;
  - 30 plików bez rekordu;
  - od 12.10 brak nowych pustych plików (trigger `reject_zero_byte_photo_storage` działa).
- **Wpływ:** w 6 miejscach dokumentacji zdjęcie jest uszkodzone. Pracownik lub administrator może tego nie wiedzieć.
- **Pewność:** POTWIERDZONE.
- **Rozwiązanie:**
  - raport dla właściciela: które montaże (SELECT);
  - oznaczenie w aplikacji „zdjęcie uszkodzone — dodaj ponownie”;
  - porządkowanie sierot dopiero po decyzji. Zmiana danych produkcji wymaga zgody.
- **Ryzyko poprawki:** niskie.

### P1-6. System testów nie sprawdza zachowania na iPhonie i prawdziwej bazy
- **Dowód:**
  - 209 z 267 skryptów `scripts/smoke-*` czyta tylko kod (bez importu modułów `src`);
  - 39 specyfikacji Playwright działa w Chromium na atrapie (`mockSupabaseClient.js`, dwie rozjechane kopie: 813 i 972 linie);
  - `playwright.v1092-webkit.config.js` istnieje, ale nie jest używany w CI.
- **Wpływ:** błędy Safari (puste uploady, zawieszone odczyty Blob — incydent 13.42–13.65) przechodzą przez CI na zielono. Rozjazd atrapy z produkcją (RLS, triggery) jest niewidoczny.
- **Pewność:** POTWIERDZONE.
- **Rozwiązanie (rosnąco według kosztu):**
  1. Uruchamiać kluczowe E2E (zdjęcia, tabliczki, offline, protokół) także w Playwright WebKit (job w CI, ok. 5 minut).
  2. Lokalny Supabase w CI (`supabase start` + schemat z P1-3) dla testów RLS i RPC.
  3. Nie dopisywać nowych testów typu regex jako jedynego dowodu (zgodnie z `CLOSURE-GATE.md`, który już tego zabrania).
- **Ryzyko poprawki:** niskie (tylko CI).

### P1-7. Podglądy Cloudflare Pages: publiczne buildy każdej gałęzi z nieznaną konfiguracją
- **Dowód:** check „Cloudflare Pages” przy każdym pushu publikuje `https://<gałąź>.wawis.pages.dev`, np. `release-v13-70.wawis.pages.dev`.
- **Wpływ:** jeśli podgląd ma zmienne `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` produkcji, to:
  - każda niedokończona gałąź jest działającą aplikacją na produkcyjnych danych, dostępną po zalogowaniu;
  - adres wygląda wiarygodnie (ryzyko podszywania się).

  RLS chroni przed obcymi, ale nie przed błędem w nieprzetestowanym kodzie użytym przez pracownika.
- **Pewność:** NIEZWERYFIKOWANE (brak dostępu).
- **Rozwiązanie:**
  - właściciel sprawdza w Cloudflare: Pages → wawis → Settings → Environment variables (Preview);
  - jeśli integracja nie jest potrzebna, odłączyć repozytorium; jeśli jest, ustawić `VITE_SUPABASE_MODE=mock` dla Preview.
- **Ryzyko poprawki:** brak dla Vercel.

---

## 5. P2 — średnie

| ID | Problem | Lokalizacja / dowód | Wpływ | Pewność | Rozwiązanie | Ryzyko |
|---|---|---|---|---|---|---|
| P2-1 | Panel Urządzeń zapisuje model i SN do `jobs` bez kontroli konfliktu (ostatni zapis wygrywa), choć formularz montażu używa CAS | `src/modules/devices-fetch.js:412` i `src/mobile791/modules/devices-fetch.js:386`: `.update(payload).eq('id', sourceJobId)` | Admin edytuje urządzenie, a w tym czasie pracownik zapisuje tabliczki: zapis pracownika może zostać nadpisany | PRAWDOPODOBNE | Użyć `save_job_concurrent_v1168` z `expected` | Niskie |
| P2-2 | Kod zdjęć mobilnych to warstwy kolejnych obejść (13.42–13.70); po 13.66 większość ścieżki offline służy tylko starym rekordom | `photos.js` 1879 linii, `photo-offline-queue.js` 677 | Trudne utrzymanie, ryzyko kolejnych regresji | POTWIERDZONE | Po potwierdzeniu pustych kolejek u wszystkich (telemetria `queue_pending=0` + sprawdzenie na telefonach) usunąć wysyłkę z kolejki, zostawić tylko odczyt i ręczne usuwanie starych rekordów | Średnie |
| P2-3 | Dwie rozjechane kopie aplikacji (desktop / mobile) | 80 wspólnych nazw plików; np. `jobPermissions.js` różni się o 32 linie, `useAppSession.js` o 343 linie | Ta sama reguła biznesowa może działać inaczej na desktopie i telefonie | POTWIERDZONE | Stopniowo przenosić czystą logikę (uprawnienia, walidacja urządzeń, formatowanie) do wspólnego `src/shared/`. Ekrany zostają osobne. | Średnie |
| P2-4 | RLS pozwala każdemu pracownikowi czytać wszystkie montaże, kontrahentów i zdjęcia oraz edytować każdy niezakończony montaż; `job_access` (przypisania) nie ogranicza dostępu | `current_user_can_view_job` / `current_user_can_edit_job` sprawdzają tylko `current_user_is_staff()` | Zgodne z małym zespołem, ale niezgodne z intuicją „widzę swoje montaże” | POTWIERDZONE (czy to błąd — decyzja właściciela) | Jeśli ma być ograniczenie: polityki oparte o `job_access` / `main_technician_id` | Wysokie (zmiana RLS) |
| P2-5 | Wymagany status check `main` to tylko `targeted-checks`; E2E na zbudowanej aplikacji (`built-photo-queue-e2e`, `built-nameplate-e2e`) nie blokują scalenia | ruleset `Wawis` (GitHub API) | Scalenie bez nich jest technicznie możliwe | POTWIERDZONE | Dodać oba jako wymagane (ustawienie GitHub — zgoda właściciela) | Niskie |
| P2-6 | Diagnostyka: większość zdarzeń bez klasyfikacji; starsze wersje raportowały `queue_pending=0` także przy błędzie odczytu | 491 `console.warn`, 135 `job.details.retry`, 87 `console.error` z kodem `DIAGNOSTIC_UNCLASSIFIED` (7 dni) | Utrudnia wykrywanie problemów | POTWIERDZONE | Kody dla `job.details.retry`, `nameplate.save.*`, `photos.queue.*`; panel administratora z liczbą błędów na wersję i użytkownika | Niskie |
| P2-7 | Bucket `job-photos` bez limitu rozmiaru i typu pliku | `storage.buckets`: `file_size_limit=null`, `allowed_mime_types=null` (pozostałe buckety mają limity) | Przypadkowo duży plik lub nieobrazek trafi do dokumentacji | POTWIERDZONE | Limit np. 15 MB i typy `image/*` (zmiana Storage — zgoda) | Niskie |
| P2-8 | Częste ponowne pobieranie szczegółów montażu | 135 zdarzeń `job.details.retry` w 7 dni u 5 osób | Wolniejsze otwieranie montaży przy słabym zasięgu | PRAWDOPODOBNE | Pomiar czasu zapytań (logi Supabase), ewentualnie lżejszy zestaw kolumn | Niskie |
| P2-9 | CSS: 27,7 tys. linii, 4689 × `!important`, warstwy `v10xx`/`v12xx` | `src/styles.css` (10 930), `src/mobile791/styles.css` (8 836) | Każda zmiana wyglądu grozi efektem ubocznym; dlatego zasady wymuszają E2E przy CSS | POTWIERDZONE | Nie przepisywać naraz; przy każdej zmianie modułu porządkować jego style | Niskie |
| P2-10 | Rozjazd konfiguracji Edge Functions: `config.toml` mówi `verify_jwt=false` dla `send-assignment-push`, a produkcja ma `true`. Na produkcji działa `sms-stage4-bundle-probe` (próbna funkcja spoza repozytorium) | `supabase/config.toml`, `list_edge_functions` | Kolejne wdrożenie z repozytorium zmieni zachowanie | POTWIERDZONE | Ujednolicić `config.toml`; usunąć funkcję próbną (zgoda) | Niskie |

---

## 6. P3 — usprawnienia

- **P3-1. Martwe pliki i zasoby:**
  - `public/mobile-v1039.css` … `v1041.css` (nieużywane);
  - pusty publiczny bucket `WaWis`;
  - ok. 70 plików `RELEASE-RESULT-*.md` i 57 plików SQL w katalogu głównym.

  Przenieść do `docs/archive/` i `supabase/legacy/`.
- **P3-2. Niespójne nazwy ról w SQL:** `admin` / `Administrator` / `employee` / `Pracownik` / `Oczekujący`. Jedna funkcja `role_is_admin(text)` i jedna lista ról.
- **P3-3. `REGRESSION-LEDGER.md`:**
  - 87 pozycji `FIXED-UNVERIFIED`, 1 `OPEN` (`PH-1362-IOS0B`, w praktyce rozwiązany w 13.64);
  - po testach z 26.10 uporządkować statusy.
- **P3-4. Nieaktualna dokumentacja:**
  - `MAIN-PROTECTION.md` opisuje „final release checks”, ZIP na Drive i nieistniejące wymagania;
  - `AGENTS.md` i `CLAUDE.md` różnią się zakresem uprawnień (relacja jest opisana w `CLAUDE.md`).

  Ujednolicić.
- **P3-5. Subskrypcje PUSH:** 73 wiersze dla administratora (3 aktywne), 20 dla jednego pracownika. Okresowe czyszczenie nieaktywnych.
- **P3-6. Deduplikacja klienta po nazwie** (`worker_create_or_get_contractor_for_job`) może przypisać montaż do innego klienta o identycznej nazwie. Dopasowanie po nazwie tylko z potwierdzeniem.
- **P3-7. Doradca wydajności:** 13 kluczy obcych bez indeksu, 16 nieużywanych indeksów. Przy obecnej skali (setki rekordów) bez wpływu; porządek przy okazji.
- **P3-8. Weryfikacja wersji po wdrożeniu:** mój odczyt `/app-version.json` przez WebFetch zwracał nieaktualną wartość (13.69) mimo działającej 13.70. Dodać izolowany workflow, który po wdrożeniu odczytuje wersję bezpośrednio (`curl` z GitHub Actions).

---

## 7. Bezpieczeństwo — stan

**Mocne strony (sprawdzone na produkcji):**

- **RLS:** włączone na wszystkich 24 tabelach `public`. Tabele bez polityk (`fakturownia_invoice_attempts`, tabele `private.*`) są dostępne tylko z serwera.
- **Funkcje:** 44 funkcje `SECURITY DEFINER` dostępne dla zalogowanych — każda `admin_*` sprawdza rolę administratora, wszystkie mają ustawiony `search_path`, żadna nie jest dostępna dla `anon`.
- **Role:** zmianę roli blokuje trigger `private.guard_profile_role`, a nowe konto dostaje rolę „Oczekujący” (`handle_new_user`).
- **Storage:** buckety z danymi są prywatne. Usuwanie plików zdjęć i protokołów jest możliwe tylko dla plików bez rekordu w bazie i w koszu (`job_file_can_be_deleted`).
- **Edge Functions bez JWT** uwierzytelniają się same:
  - token callbacku SMSAPI porównywany w stałym czasie;
  - tokeny zdarzeń PUSH;
  - skrót tokenu potwierdzenia;
  - `getUser()` w funkcjach SMS i paliwa.
- **Endpoint AI** (`api/read-nameplate-ai.js`) wymaga sesji Supabase i sprawdza dostęp do montażu.
- **Sekrety:** w repozytorium nie znalazłem kluczy ani tokenów (przeszukanie wzorców JWT, kluczy prywatnych, tokenów SMSAPI/Fakturowni). Klient czyta wyłącznie `VITE_SUPABASE_URL` / `ANON_KEY` ze zmiennych środowiskowych.

**Do decyzji lub sprawdzenia:**

- zakres widoczności danych dla pracowników (P2-4);
- Cloudflare Pages (P1-7);
- kopie zapasowe (P1-2);
- limity bucketu zdjęć (P2-7).

---

## 8. Niezawodność — scenariusze

| Scenariusz | Stan | Ocena |
|---|---|---|
| Utrata internetu w trakcie pracy | Statusy i komentarze kolejkowane z wykrywaniem konfliktów. Zdjęcia i tabliczki: komunikat (13.66+). Okno „Brak internetu” ze szkicem w pamięci (13.68). | Dobrze, ale P1-1 (ekrany po aktualizacji) |
| Zamknięcie aplikacji podczas zapisu | Montaż: CAS po stronie bazy (brak półzapisu). Protokół: uzgadnianie po utracie odpowiedzi. Szkic urządzeń 13.68 ginie po zamknięciu aplikacji (świadoma decyzja). | Dobrze |
| Powrót z tła | `pageshow` / `focus` / `visibilitychange` sprawdzają wersję. Przeładowanie wstrzymywane przy otwartym formularzu (`update-reload-guard.js`). | Dobrze |
| Ponowne logowanie / zmiana użytkownika | Kolejki offline kluczowane `owner` (ID użytkownika). Subskrypcje PUSH z `ownership_generation`. | Dobrze (testy istnieją) |
| Równoczesna praca | Formularz montażu i offline: CAS. Panel Urządzeń: brak CAS (P2-1). | Częściowo |
| Duplikaty | Idempotentne tworzenie montażu (`create_operation_id`), idempotentny upload zdjęć, claim SMS. | Dobrze |
| Niekompletne zapisy | Zdjęcia: trigger odrzuca 0 B, ale 6 starych pustych (P1-5). Protokół: PDF zostaje przy niejednoznacznym wyniku (bezpieczne). | Dobrze |
| Cache i aktualizacja wersji | Każda wersja kasuje cache poprzedniej. Moduły lazy niezapisane (P1-1). Czytniki tabliczek w trwałym cache (13.70). | Wymaga poprawy |
| Synchronizacja a protokół | Zakończenie offline czeka na zapis tabliczek (`OFFLINE_DEPENDENCY_WAITING`). Protokół wymaga internetu. | Spójne, ale P1-4 |
| Zmiany z poprzednich audytów | Kody diagnostyczne (12.72) — wdrożone, choć dużo niesklasyfikowanych. PUSH — dziś potwierdzony odbiór. `PH-1362-IOS0B` — rozwiązany w 13.64 (do zamknięcia po teście iPhone). | — |

---

## 9. Testy i kontrola jakości

**Dobrze przetestowane:**

- SMS (testy na dwóch sesjach PostgreSQL w CI);
- kolejka zdjęć: 25 scenariuszy harnessu, 6 E2E na zbudowanej aplikacji;
- kontrola uprawnień w RPC (testy SQL);
- klasyfikacja ryzyka zmian (`release-impact`) i Closure Gate działający fail-closed.

**Czego testy nie sprawdzają:**

- Safari/WebKit;
- prawdziwy Supabase (RLS, triggery, Storage) w E2E;
- start aplikacji offline po aktualizacji;
- protokół end-to-end z prawdziwym PDF w WebKit;
- zgodność desktop ↔ mobile tej samej reguły;
- migracje na świeżej bazie.

**Fałszywe poczucie bezpieczeństwa:**

- testy regex (78%) przechodzą, dopóki tekst kodu się zgadza, nawet gdy logika jest zła;
- atrapa Supabase zachowuje się tak, jak ją napisano, a nie jak produkcja;
- Chromium z emulacją iPhone'a nie jest Safari.

**Czy CI i Closure Gate chronią produkcję?** Chronią przed regresjami znanych błędów i przed scaleniem bez testów. Nie chronią przed nowymi klasami błędów specyficznych dla iPhone'a — dowodem jest seria 13.42–13.70.

**Testy obowiązkowe przed każdym wdrożeniem (moja propozycja):**

1. `targeted-checks` + oba E2E na zbudowanej aplikacji (wymagane w rulesecie).
2. Dla zmian mobilnych: ten sam zestaw E2E w WebKit.
3. Dla zmian zdjęć, offline, service workera i protokołu: krótka lista na fizycznym iPhonie przed udostępnieniem wszystkim (jeden telefon, 10 minut).
4. Po wdrożeniu: automatyczny odczyt wersji i telemetria pierwszej godziny (liczba błędów nowej wersji).

---

## 10. Wydajność i wygoda

- **Baza:** mała (163 montaże, 993 zdjęcia). Zapytania nie są problemem. Lista montaży ładowana stronami po 500, Realtime filtruje zmiany per montaż (bez pełnego odświeżania).
- **Zdjęcia:** miniatury przez podpisane adresy. Ostrzeżenia `PHOTO_THUMBNAIL_RETRY` (49 / 35 / 19 tygodniowo w różnych wersjach) — wolne ładowanie miniatur przy słabym zasięgu.
- **Start aplikacji:** paczki nie zmierzyłem (brak builda w środowisku audytu). Duże pliki to m.in. słownik modeli 1077 linii i OCR (Tesseract ok. 4 MB WASM, ładowany tylko przy tabliczkach).
- **Komunikaty:** wersje 13.66–13.68 słusznie uprościły paski synchronizacji. Wiele okien technicznych (naprawa kolejki, stare zdjęcia) może zniknąć po wygaszeniu starej kolejki (P2-2).
- **Codzienna praca:** największą przeszkodą dla montera jest dziś niestabilność wynikająca z częstych zmian, a nie brak funkcji.

---

## 11. Ocena autorska

1. **Stan techniczny: 6/10.**
   - Bezpieczeństwo danych i backend: 8/10.
   - Kod frontendu: 5/10 (duplikacja, warstwy obejść, CSS).
   - Proces wydań: 5/10 (rygor formalny wysoki, ale tempo i brak testów na iPhonie niwelują jego wartość).
2. **Architektura nadaje się do rozwoju pod warunkiem uporządkowania**, bez przepisywania:
   - wspólna warstwa logiki;
   - jeden schemat bazy w repozytorium;
   - uproszczenie ścieżki zdjęć.

   React + Supabase + PWA to właściwy wybór dla tej skali.
3. **Trzy największe zagrożenia:**
   - zbyt częste wydania bez weryfikacji na iPhonie (P0-1 / P1-6);
   - brak kopii zapasowych zdjęć i protokołów oraz nieodtwarzalny schemat (P1-2, P1-3);
   - aplikacja niekompletna offline po aktualizacji (P1-1).
4. **Niepotrzebnie skomplikowane:**
   - kolejka zdjęć IndexedDB po decyzji „zdjęcia tylko online”;
   - dwa forki aplikacji i dwie atrapy Supabase;
   - model urządzeń „tekst wieloliniowy w `jobs` + kopia w `devices`”;
   - rozbudowane mechanizmy release (micro-UI, wiele profili) przy jednym programiście.
5. **Co poprawiłbym najpierw:**
   - zamrożenie i test 26.10 (P0-1);
   - precache wszystkich plików wersji w service workerze (P1-1);
   - WebKit w CI (P1-6);
   - kopie zapasowe (P1-2, z właścicielem);
   - bazowy zrzut schematu (P1-3).
6. **Działa dobrze i nie wymaga zmian:**
   - RLS i funkcje administracyjne;
   - CAS zapisu montażu;
   - synchronizacja statusów offline;
   - zapis protokołu;
   - PUSH z potwierdzeniami;
   - moduł SMS;
   - Closure Gate jako zasada.
7. **Obowiązkowe testy przed wdrożeniem:** sekcja 9.
8. **Organizacja dalszego rozwoju:**
   - **Rytm wydań:** maksymalnie jedno wydanie mobilne dziennie (poprawki krytyczne wyjątkiem), w godzinach, gdy monterzy nie pracują w terenie, np. wieczorem.
   - **Każda zmiana zdjęć, offline lub service workera** najpierw na jednym telefonie (Paweł albo administrator), dopiero potem reszta. Na tym etapie bez osobnego kanału beta — po prostu kolejność.
   - **Backlog według tego raportu**, małe PR-y, każdy z testem, który odtwarza błąd.
   - **Co tydzień** krótki przegląd telemetrii: błędy na wersję i użytkownika.

---

## 12. Plan naprawczy

| Etap | Prace | Ryzyko | Weryfikacja | Wymaga zgody |
|---|---|---|---|---|
| 0. Poniedziałek 26.10 | Zamrożenie wydań; test 13.70 na iPhonie Pawła (lista + tabliczka offline); potem Kacper i reszta; instrukcja wycofania | — | Lista testowa, telemetria `app_version=13.70` u pracowników, SELECT nowych zdjęć (rozmiar > 0) | Nie |
| 1. Tydzień 1 | P1-1 precache wersji w service workerze + E2E „aktualizacja → offline → otwórz montaż / formularz / protokół” | Średnie | E2E Chromium + WebKit, test na iPhonie | Nie (GO) |
| 1. Tydzień 1 | P1-6 job WebKit w CI dla E2E mobilnych | Niskie | Zielony przebieg WebKit | Nie (workflow testowy) |
| 1. Tydzień 1 | P1-7 sprawdzenie Cloudflare przez właściciela | — | Zrzut ustawień Preview | Właściciel |
| 2. Tydzień 2 | P1-3 zrzut schematu produkcji do repozytorium, porządek SQL | Niskie | Porównanie z produkcją (`SELECT`) | Nie |
| 2. Tydzień 2 | P1-2 kopie zapasowe: plan Supabase + kopia Storage | Niskie | Odtworzenie przykładowego pliku z kopii | Tak (sekrety, funkcje) |
| 2. Tydzień 2 | P1-5 raport 6 uszkodzonych zdjęć, oznaczenie w aplikacji | Niskie | SELECT przed i po | Tak (dane) |
| 3. Tydzień 3 | P2-1 CAS w panelu Urządzeń; P2-6 kody diagnostyczne; P2-5 wymagane checki | Niskie | Test dwóch sesji (admin + pracownik) | P2-5: tak |
| 4. Po potwierdzeniu pustych kolejek | P2-2 uproszczenie kodu zdjęć (usunięcie wysyłki z kolejki) | Średnie | Harness S01–S25, E2E, iPhone | Nie (GO) |
| 5. Ciągle | P2-3 wspólna logika desktop/mobile (moduł po module), P2-9 porządek CSS przy okazji zmian, P3 | Niskie–średnie | Testy wykonawcze zamiast regex | Nie |
| Decyzje biznesowe | P1-4 protokół offline; P2-4 zakres widoczności pracowników | Wysokie | — | Tak |

---

## Załącznik A — kluczowe dowody (zapytania tylko do odczytu, 25.10.2026)

- **Wersje pracowników:** `app_diagnostic_events`, ostatnie zdarzenie na użytkownika (7 dni). Administrator mobilnie: 13.70 (25.10 17:00 UTC). Pracownicy: 13.55, 13.38, 13.36, 13.28.
- **Zdjęcia:**
  - 993 rekordy, 1023 obiekty w `job-photos` (496 MB);
  - 13 obiektów 0 B, w tym 6 powiązanych z rekordami;
  - 30 obiektów bez rekordu;
  - 0 rekordów bez obiektu;
  - od 12.10: 0 pustych.
- **Migracje:** 117 na produkcji (ostatnia `20261020130503`), 94 sygnatury w repozytorium, część wspólna 41.
- **Edge Functions:** 12 aktywnych. `backup-storage-assets` niewdrożona. Na produkcji jest `sms-stage4-bundle-probe` spoza repozytorium.
- **PUSH (14 dni):** `job_assigned` 24 wysłane / 24 odebrane / 16 wyświetlonych; `job_completed` 17 / 11 / 11.
- **Testy:**
  - 267 skryptów smoke, w tym 209 tylko czytających kod źródłowy;
  - 39 specyfikacji Playwright (Chromium, atrapa);
  - WebKit poza CI.
- **Ruleset `main`:** wymagany wyłącznie `targeted-checks` (strict), PR wymagany, blokada force-push i usuwania.
