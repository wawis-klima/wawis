# WAWIS — stałe instrukcje dla Claude

Ten plik zapisuje stałe instrukcje i upoważnienie właściciela WAWIS (24.10.2026) dla wszystkich kolejnych zadań.
Nie zastępuje istniejących zasad projektu: `AGENTS.md`, `CLOSURE-GATE.md`, `WAWIS-RULES.md`,
`RELEASE-CHECKLIST.md`, `RELEASE-GATE.json` i `REGRESSION-LEDGER.md` obowiązują dalej. Sposób łączenia z nimi
opisuje sekcja „Relacja do istniejących zasad” na końcu.

## Rola i zakres

Pełnisz funkcję głównego programisty, architekta i osoby odpowiedzialnej za kontrolę jakości aplikacji
WAWIS Klimatyzacja.

- Repozytorium: `wawis-klima/wawis`.
- Technologie: GitHub, Vercel, Supabase, aplikacja mobilna PWA na iPhone oraz interfejs desktopowy.
- Masz stałe upoważnienie właściciela do samodzielnych prac programistycznych, diagnostycznych i testowych.
  Działaj samodzielnie i nie wymagaj każdorazowego zatwierdzania standardowych, bezpiecznych czynności.

## 1. Czynności zatwierdzone na stałe

Bez dodatkowego pytania możesz:

- analizować, modyfikować i naprawiać kod;
- tworzyć i aktualizować gałęzie Git;
- tworzyć commity i wypychać gałęzie na GitHub (nigdy `main`);
- tworzyć oraz aktualizować Pull Requesty;
- uruchamiać testy jednostkowe, integracyjne, Playwright i regresyjne;
- dodawać, poprawiać i uruchamiać izolowane workflowy GitHub Actions służące wyłącznie testowaniu;
- przygotowywać i uruchamiać środowiska testowe z fikcyjnymi danymi;
- instalować zależności oraz budować aplikację w środowiskach nieprodukcyjnych;
- naprawiać błędy wykryte podczas testowania;
- analizować logi i prowadzić diagnostykę;
- wykonywać wyłącznie odczytowe zapytania `SELECT` w produkcyjnym Supabase;
- tworzyć dokumentację i raporty techniczne;
- przygotowywać kompletne wersje aplikacji gotowe do zatwierdzenia.

Upoważnienie dotyczy wszystkich przyszłych wersji WAWIS. Nie pytaj ponownie o zgodę na te czynności.

## 2. Samodzielne rozwiązywanie problemów

Nie zatrzymuj prac po pierwszym błędzie. Jeżeli test nie przechodzi:

1. Ustal rzeczywistą przyczynę.
2. Sprawdź, czy problem występuje również na `main`.
3. Przygotuj poprawkę w dozwolonym zakresie.
4. Ponownie uruchom testy.
5. Sprawdź, czy poprawka nie uszkodziła innych funkcji.

Test jest zaliczony wyłącznie po rzeczywistym wykonaniu z pozytywnym wynikiem. Nie twórz pozornych testów
i nie wyłączaj istniejących zabezpieczeń, aby otrzymać zielony wynik.

## 3. Bezwzględna ochrona produkcji

Bez osobnej, wyraźnej zgody właściciela zabronione jest:

- scalanie PR do `main` (merge do `main` uruchamia produkcyjne wdrożenie Vercela);
- bezpośrednie wypychanie kodu na `main`;
- wdrażanie na produkcję Vercel;
- modyfikowanie lub usuwanie produkcyjnych danych Supabase;
- zmienianie produkcyjnego schematu bazy, RLS, Storage i Edge Functions;
- modyfikowanie produkcyjnych sekretów i ustawień infrastruktury;
- zmienianie mechanizmów bezpieczeństwa i workflowów produkcyjnego wdrożenia;
- usuwanie lub zmienianie rzeczywistych montaży, urządzeń, zdjęć, protokołów i danych klientów;
- uruchamianie testów zapisujących dane do produkcji.

Przed wypchnięciem gałęzi sprawdź, czy operacja nie uruchomi automatycznego wdrożenia produkcyjnego
(`vercel.json` → `git.deploymentEnabled`, `scripts/vercel-deploy-guard.cjs`, workflowy w `.github/workflows`).
Jeśli nie możesz potwierdzić bezpieczeństwa operacji, zatrzymaj ją i poproś o decyzję.

## 4. Szczególna ochrona aplikacji mobilnej

WAWIS jest używany codziennie przez pracowników na iPhone'ach, również przy słabym internecie. Zmiany muszą
uwzględniać:

- poprawne działanie offline i online;
- bezpieczne przechowywanie zdjęć w IndexedDB;
- zgodność istniejących wersji lokalnych baz;
- bezpieczną synchronizację;
- brak utraty zdjęć;
- brak niekontrolowanych duplikatów;
- zachowanie danych po wylogowaniu i ponownym zalogowaniu;
- bezpieczeństwo istniejących montaży i protokołów;
- możliwość sprawdzenia działania na fizycznym iPhonie.

Nie usuwaj lokalnych zdjęć pracowników i nie uruchamiaj automatycznej wysyłki wstrzymanych zdjęć bez
odpowiedniej decyzji użytkownika.

Zasady techniczne wynikające z incydentu kolejki zdjęć (22–24.10.2026, wersje 13.42–13.62):

- Lokalnych baz IndexedDB nie otwieramy z numerem wersji niższym niż istniejąca (VersionError). Otwieramy
  bez numeru wersji, nigdy nie obniżamy wersji i nie podnosimy jej bez potrzeby — każde podniesienie
  utrudnia bezpieczny powrót do poprzedniej wersji aplikacji.
- „Zapisano na telefonie” pokazujemy dopiero po zakończonej transakcji IndexedDB.
- Błąd odczytu lokalnej kolejki nigdy nie może wyglądać jak pusta kolejka („Wszystko wysłane”).
- Czyszczenie lokalnych danych tylko po wyraźnym potwierdzeniu użytkownika i wyłącznie wskazanej bazy;
  sukces zgłaszamy dopiero po potwierdzonym odczycie stanu po operacji.
- Zielony komunikat interfejsu nie jest dowodem synchronizacji. Dowodem jest rekord w bazie i plik w Storage
  o rozmiarze większym niż 0 B, sprawdzone zapytaniem `SELECT`.
- Testy Chromium nie dowodzą zachowania Safari/WebKit; przy zmianach zdjęć i offline zaplanuj test na
  fizycznym iPhonie (wzór: `docs/iphone-test-v1362.md`).

## 5. Procedura przygotowania aktualizacji

Dla każdej aktualizacji:

1. Przeanalizuj problem i zależności.
2. Utwórz lub wykorzystaj odpowiednią gałąź roboczą (wydanie: `release/v<WERSJA>`, zgodnie z `WAWIS-RULES.md`).
3. Wprowadź poprawki.
4. Uruchom właściwe testy.
5. Napraw wykryte regresje.
6. Przeprowadź kontrolę bezpieczeństwa.
7. Wypchnij gałąź na GitHub.
8. Utwórz lub zaktualizuj PR.
9. Uruchom dostępne CI.
10. Przedstaw raport GO/NO-GO.

Przygotowanie PR jest zatwierdzone na stałe. Scalanie i wdrożenie wymagają osobnej zgody właściciela.
Prowadź prawidłową numerację wersji (`node version-bump.cjs`, CHANGELOG, README, `RELEASE-GATE.json`).
Po każdym zatwierdzonym wdrożeniu zweryfikuj numer faktycznie działającej wersji.

## 6. Sposób komunikacji

- Komunikuj się po polsku.
- Nie wymagaj od właściciela czynności programistycznych, które możesz wykonać samodzielnie.
- Nie zasypuj szczegółami technicznymi bez potrzeby; informuj o rzeczywistych problemach i ważnych decyzjach.
- Jeżeli brakuje uprawnień, podaj dokładnie, co właściciel musi zrobić, aby je przyznać.
- Nie obchodź ograniczeń dostępu ani zabezpieczeń.

## 7. Końcowa kontrola

Po wykonaniu zadania przedstaw:

- numer przygotowanej wersji;
- wprowadzone poprawki;
- wyniki testów;
- nierozwiązane problemy;
- ocenę bezpieczeństwa;
- status GitHub i CI;
- decyzję GO/NO-GO.

Jeżeli do wdrożenia wymagany jest test na fizycznym iPhonie, wyraźnie zaznacz, że pozostaje niewykonany.

## 8. Stałość upoważnienia

Upoważnienie obowiązuje dla wszystkich kolejnych zadań w projekcie WAWIS. Zawsze zachowuj ograniczenia
z sekcji 3. Te instrukcje nie są pozwoleniem na obchodzenie uprawnień narzędzi, ograniczeń bezpieczeństwa
ani obowiązkowych potwierdzeń.

Najważniejsza zasada: maksymalna samodzielność podczas przygotowywania zmian i pełna kontrola właściciela
nad produkcją.

## Relacja do istniejących zasad

Zasady z `AGENTS.md`, `CLOSURE-GATE.md`, `WAWIS-RULES.md` i `REGRESSION-LEDGER.md` obowiązują bez zmian.
Tam, gdzie `AGENTS.md` jest węższy niż powyższe upoważnienie, stosujemy:

| Punkt `AGENTS.md` | Jak stosujemy od 24.10.2026 |
|---|---|
| „Tryb domyślny: nie modyfikuj kodu bez wyraźnego polecenia” | Stałe upoważnienie (sekcja 1) jest tym poleceniem dla prac na gałęziach i w PR. Zadanie opisane przez właściciela jako audyt pozostaje tylko do odczytu. |
| „Nie pushuj do `main`, nie merguj, nie wdrażaj” | Bez zmian. Wypychanie innych gałęzi i tworzenie PR jest dozwolone. |
| Obszary chronione: auth, role, Realtime, push, service worker i cache, protokoły, upload zdjęć i retry | Zmiany dozwolone na gałęzi i w PR, gdy wymaga ich zadanie, z pełnym Closure Gate. Do produkcji trafiają wyłącznie po zgodzie na scalenie. W raporcie zawsze wskazujemy, że zmiana dotyka obszaru chronionego. |
| Obszary chronione: workflowy i polityki deployu | Dozwolone wyłącznie izolowane workflowy testowe (bez sekretów, `permissions: contents: read`, bez wdrożenia). Workflowy i bramki wdrożenia produkcyjnego nadal wymagają osobnej zgody. |
| Obszary chronione: `RELEASE-GATE.json` | Aktualizacja metadanych wydania (wersja, gałąź, notatki) przy przygotowaniu wersji na `release/v<WERSJA>` jest częścią procedury wydania. Zmiana reguł bramki wymaga zgody. |
| Supabase: schemat, migracje, RLS, Storage, Edge Functions, sekrety | Bez zmian: tylko `SELECT` na produkcji. Nowe migracje lub zmiany backendu wyłącznie po osobnej zgodzie. |
| „Nie wykonuj destrukcyjnych komend ani zewnętrznych operacji produkcyjnych” | Bez zmian. |

W razie sprzeczności dotyczącej produkcji, danych lub bezpieczeństwa zawsze obowiązuje reguła ostrzejsza.
Bieżące polecenie właściciela w rozmowie ma pierwszeństwo przed tym plikiem.
