# Release checklist

Krótka checklista wydania dla aplikacji mobilnej i desktopowej. Mobilny flow uruchamia `npm run release:mobile`, a jego plan bez wykonywania komend pokazuje `npm run release:mobile:dry-run`. Oba korzystają z `scripts/run-release.cjs`.

Desktopowy tryb `npm run release:desktop:sandbox` pozostaje wariantem bez `npm run build` w sandboxie i zapisuje pominięte kroki w raporcie.

## Ekran protokołu na iPhonie — 9.81

- [ ] Okno protokołu ma białe tło i pionowy układ treści.
- [ ] Nagłówek, dane klienta, urządzenia i potwierdzenie nie nachodzą na siebie.
- [ ] Cały protokół można przewinąć w obrębie okna.
- [ ] Pole podpisu ma pełną szerokość i prawidłową wysokość.
- [ ] Podgląd zdjęć i pozostałe modale działają jak wcześniej.
- [ ] `npm run test:smoke:mobile-protocol-layout` przechodzi.

## Domyślna data nowego montażu — 9.80

- [ ] Nowy mobilny formularz pracownika pokazuje dzisiejszą datę z telefonu.
- [ ] Datę można ręcznie zmienić i wyczyścić przed zapisem.
- [ ] Ponowne otwarcie nowego formularza ustawia aktualny dzień.
- [ ] Edycja istniejącego zlecenia nie nadpisuje jego daty.
- [ ] `npm run test:smoke:mobile-default-installation-date` przechodzi.

## Kontrola protokołu po zakończeniu — 9.79

- [x] W Supabase uruchomiono `supabase/setup-job-protocols-v9.79.sql`.
- [ ] Na zleceniu `W trakcie` nie ma przycisku protokołu.
- [ ] Zakończenie zlecenia działa jak dotychczas i nie wymaga protokołu.
- [ ] Na zakończonej karcie pracownika i administratora pojawia się `Utwórz protokół`.
- [ ] Po podpisie PDF zapisuje się przy zleceniu, a karta pokazuje `Pobierz protokół` i `Wyślij e-mailem`.
- [ ] PDF nie zawiera numerów seryjnych i pozostaje oznaczony jako wersja testowa.
- [ ] `npm run test:smoke:mobile-protocol` przechodzi.


## Automatyczna kontrola mobile na GitHubie

Plik `.github/workflows/mobile-release-checks.yml` uruchamia się po pushu do `main`, przy każdej aktualizacji pull requestu do `main` oraz ręcznie przez `workflow_dispatch`. Instaluje zależności z publicznego npm, Chromium dla Playwright i wykonuje `npm run release:mobile -- --skip-version-bump`.

- [ ] Zadanie `Mobile release runner` ma status `ZIELONY` przed publikacją.
- [ ] Pobrano artefakt ZIP oraz `RELEASE-RESULT.md`.
- [ ] Przy statusie `CZERWONY` wersja nie jest publikowana; sprawdzamy raport i artefakty `playwright-report` / `test-results`.
- [ ] `npm run test:smoke:mobile-ci` przechodzi i potwierdza, że workflow nadal zawiera publiczny npm, Playwright, mobilny runner, build, ZIP oraz raport.



## Kontrola Centrum synchronizacji 8.98

- [ ] `npm run test:smoke:mobile-photo-sync-center`
- [ ] status połączenia w nagłówku otwiera okno `Synchronizacja zdjęć`
- [ ] centrum pokazuje tylko kolejkę aktualnie zalogowanego pracownika
- [ ] zdjęcie offline pozostaje na liście po przeładowaniu PWA
- [ ] `Wyślij wszystkie` obejmuje także wpisy z błędem i jest zablokowane bez internetu
- [ ] przycisk `Otwórz` przechodzi do zlecenia, którego dotyczy zdjęcie
- [ ] po opróżnieniu kolejki widoczny jest stan `Wszystko wysłane`

## Kontrola diagnostyki i wyglądu 8.97
- [ ] `npm run test:smoke:diagnostic-report` potwierdza raport na desktopie i telefonie oraz maskowanie danych.
- [ ] `npm run test:smoke:release-visual-controls` potwierdza obowiązkowe testy pełnego renderu i publikację screenshotów.
- [ ] Workflow desktop zapisuje `visual-artifacts/desktop-release-visual.png`.
- [ ] Workflow mobile zapisuje `visual-artifacts/mobile-release-visual.png`.
- [ ] Screenshoty nie pokazują fontu szeryfowego, skrajnych rozmiarów tekstu ani poziomego przepełnienia.
- [ ] Przycisk `Pobierz raport diagnostyczny` działa na desktopie administratora i w górnym pasku telefonu.
- [ ] Raport deklaruje brak zdjęć, komentarzy i danych klientów oraz zawiera stan mobilnej kolejki zdjęć.

## Kontrola katalogu Rotenso 8.95
- [ ] Wcześniej wdrożono `nameplate-product-catalog-v8.92.sql`.
- [ ] Uruchomiono `nameplate-product-catalog-rotenso-seed-v8.95.sql`.
- [ ] EAN `5905567601170` rozpoznaje `Revio RO35Xo R14` jako JZ.
- [ ] Znany EAN działa także przy chwilowym braku odpowiedzi centralnego katalogu.
- [ ] Przycisk „Pobierz katalog Rotenso” tworzy CSV z 92 pozycjami.
- [ ] `npm run test:smoke:nameplate-product-catalog` przechodzi.

## Kontrola wielu adresów klienta 8.81
- [ ] Przed wdrożeniem aplikacji uruchomiono w Supabase plik `contractor-addresses-v8.81.sql`.
- [ ] Istniejący klient zachował dotychczasowy adres jako adres główny.
- [ ] Na karcie klienta można dodać drugi adres, ustawić go jako główny i wyszukać klienta po obu lokalizacjach.
- [ ] Nowy montaż można przypisać do wybranego adresu albo dodać nową lokalizację bez tworzenia drugiego klienta.
- [ ] Po późniejszej edycji lub usunięciu adresu klienta stare zlecenie nadal pokazuje zapisany historyczny adres.
- [ ] Eksport i ponowny import XLSX zachowują pełną listę adresów.
- [ ] `npm run test:smoke:contractor-addresses` przechodzi.

## Przed startem
- Zakres wydania musi być jawny: mobile, desktop albo pełny. Nie przenosimy funkcji między aplikacjami bez osobnej decyzji.
- W wersji 8.68 kolorowa pewność pól OCR działa wyłącznie w desktopie administratora; mobile pozostaje bez OCR-u. Globalne wyszukiwanie i karty JZ/JW również pozostają desktopowe.
- Numer wersji podbijamy o 1 na końcu, np. `7.57 -> 7.58`.
- Po zmianach aktualizujemy `README.md` i `CHANGELOG.md`.
- `RELEASE-RESULT.md` musi mieć ten sam numer co `app-version.json`; niezgodność blokuje `verify:release`.
- Każda nowa tabela Supabase w `public` musi mieć jawny `GRANT` dla właściwej roli API (`authenticated` i/lub `service_role`) oraz `alter table ... enable row level security`; każda nowa tabela jest sprawdzana przed ZIP-em.
- Przy zmianach SQL musi przejść `npm run test:smoke:supabase-grants`; plik `supabase-grants-audit-wawis.sql` zostaje w paczce jako audyt produkcyjnej bazy.

## Szybkie uruchomienie mobilnego release

```bash
npm run release:mobile
```

Mobilny runner uruchamia po dwa razy wspólne zabezpieczenia aplikacji oraz komplet testów zdjęć, dokumentacji tabliczek i protokołu: `test:smoke:windows-npm-runner`, `test:smoke:realtime-lite`, `test:smoke:private-photos`, `test:smoke:mobile-private-photos`, `test:smoke:mobile-photo-compression`, `test:smoke:mobile-photo-upload-rls`, `test:smoke:mobile-photo-visibility-sync`, `test:smoke:photo-cross-device-sync`, `test:smoke:mobile-photo-sync-indicator`, `test:smoke:mobile-serial-scanner`, `test:smoke:mobile-protocol`, `test:smoke:e2e-mobile` i prawdziwy `test:e2e:mobile` na profilu iPhone 14. OCR nie jest używany. E2E sprawdza kompaktowe pozycje tabliczek bez stałych miniatur, podgląd dopiero po kliknięciu, wybór single/multi i liczby JW oraz blokadę zakończenia zlecenia bez zdjęcia JZ i każdej JW. Test protokołu sprawdza, że opcjonalny dokument pojawia się dopiero po zakończeniu, zapisuje się prywatnie przy zleceniu, można go później pobrać lub wysłać e-mailem i nie zawiera numerów seryjnych. Następnie runner wykonuje `verify:release` x2, `build` x2, `verify:bundle` x2, zapisuje finalny `RELEASE-RESULT.md`, tworzy ZIP i sprawdza jego zawartość.

Plan bez wykonywania komend:

```bash
npm run release:mobile:dry-run
```

## Szybkie uruchomienie desktopowego release

```bash
npm run release:desktop
```

Ten skrypt wykonuje `version:bump`, dwa przebiegi smoke z `test:smoke:desktop-only`, `test:smoke:desktop-nameplate-ocr`, `test:smoke:desktop-global-search`, `test:smoke:sms-job-grouping`, `test:smoke:sms-log-cleanup`, `test:smoke:assignment-push`, `test:smoke:supabase-transient`, `test:smoke:source-job-id-hotfix`, `test:smoke:supabase-grants`, `test:smoke:job-multi-indoor`, `test:smoke:job-device-type-switch`, `test:smoke:job-device-spaces`, `test:smoke:release-runner`, `test:smoke:release-zip`, `test:smoke:release-zip-clean`, `test:smoke:desktop-jobs-layout-width`, `test:smoke:calendar-width`, `test:smoke:e2e-desktop`, prawdziwy `test:e2e:desktop`, testy Centrum 360, destrukcyjnych polityk RLS, tabliczek AI/kodów i `test:smoke:startup-chunk`, dwa przebiegi `verify:release`, dwa przebiegi `build`, dwa przebiegi `verify:bundle`, a na końcu ZIP, verify ZIP i zapis `RELEASE-RESULT.md`. Plan bez builda można podejrzeć krótką komendą `npm run release:desktop:dry-run`.

W sandboxie, gdzie nie uruchamiamy `npm run build`, użyj:

```bash
npm run release:desktop:sandbox
```

Ten tryb nadal podbija wersję, uruchamia smoke x2 i verify x2, tworzy ZIP oraz sprawdza ZIP. Kroki `npm run build` i `npm run verify:bundle` są wpisane w `RELEASE-RESULT.md` jako `POMINIĘTO`, żeby było jasne, że build został celowo pominięty w sandboxie.

## Podwójne sprawdzenie ręczne
Uruchom dwa pełne przebiegi:

```bash
npm run test:smoke
npm run test:smoke:version
npm run test:smoke:delete
npm run test:smoke:device-save
npm run test:smoke:job-multi-indoor
npm run test:smoke:job-device-type-switch
npm run test:smoke:job-device-spaces
npm run test:smoke:device-delete
npm run test:smoke:job-auto-contractor
npm run test:smoke:assignment-push
npm run test:smoke:supabase-transient
npm run test:smoke:source-job-id-hotfix
npm run test:smoke:empty-device-serial
npm run test:smoke:supabase-grants
npm run test:smoke:destructive-rls
npm run test:smoke:sms-summary
npm run test:smoke:sms-job-grouping
npm run test:smoke:sms-log-cleanup
npm run test:smoke:center360
npm run test:smoke:center360-personalization
npm run test:smoke:center360-installer-width
npm run test:smoke:dashboard-metrics
npm run test:smoke:admin-worker
npm run test:smoke:lazy
npm run test:smoke:suspense
npm run test:smoke:selection
npm run test:smoke:desktop-only
npm run test:smoke:desktop-nameplate-ocr
npm run test:smoke:desktop-nameplate-white-screen
npm run test:smoke:desktop-nameplate-ai-barcode
npm run test:smoke:desktop-global-search
npm run test:smoke:desktop-jobs-layout-width
npm run test:smoke:desktop-jobs-split-scroll
npm run test:smoke:release-runner
npm run test:smoke:windows-npm-runner
npm run test:smoke:npm-registry
npm run test:smoke:mobile-ci
npm run test:smoke:release-zip
npm run test:smoke:release-zip-clean
npm run test:smoke:calendar-width
npm run test:smoke:e2e-desktop
npm run test:e2e:desktop
npm run test:smoke:no-services-module
npm run test:smoke:remove-resend-email
npm run test:smoke:startup-chunk
npm run test:smoke:mobile-photo-sync-indicator
npm run test:smoke:e2e-mobile
npm run test:smoke:mobile-serial-scanner
npm run test:smoke:mobile-protocol
npm run test:e2e:mobile
npm run verify:release
npm run build
npm run verify:bundle
```

Wynik zapisujemy jako `OK x2` tylko wtedy, gdy oba przebiegi faktycznie przejdą. Po pełnym runnerze wynik powinien pojawić się w `RELEASE-RESULT.md`.

## Kontrola kreatora urządzeń administratora 9.35
- [ ] `npm run test:smoke:desktop-device-wizard-polish` przechodzi.
- [ ] Okno `Urządzenia` na desktopie ma maksymalnie 540 px szerokości, a zawartość wypełnia je bez szerokich bocznych pasów.
- [ ] Główna akcja ma etykietę `Zapisz urządzenia` i neutralny grafitowy styl.
- [ ] Zewnętrzny promień wynosi 18 px, karta urządzenia 78 px, a przycisk dodania 40 px.
- [ ] Mobilny kreator zachowuje dotychczasową etykietę `Zapisz montaż` i dotychczasowy wygląd.

## Kontrola oddzielnych galerii 9.36
- [ ] `npm run test:smoke:photo-preview-gallery-separation` przechodzi.
- [ ] Otwarcie zdjęcia z sekcji `Zdjęcia montażu` i użycie obu strzałek nie pokazuje tabliczki znamionowej.
- [ ] Otwarcie tabliczki przy JZ/JW nie miesza jej ze zwykłymi zdjęciami montażu.
- [ ] Po przejściu do innego zlecenia podgląd zaczyna od galerii nowo otwartej karty.

## Kontrola push po komentarzu pracownika 9.37
- [ ] `npm run test:smoke:comment-admin-push` przechodzi.
- [ ] Zaktualizowano Edge Function `send-assignment-push`; migracja SQL nie jest potrzebna.
- [ ] Pracownik dodaje komentarz, a administrator z aktywnym push otrzymuje `Nowy komentarz do montażu`.
- [ ] Kliknięcie powiadomienia otwiera właściwy montaż, a ekran blokady nie pokazuje treści komentarza.
- [ ] Komentarz administratora nie wysyła push i ponowienie żądania nie dubluje dostawy tego samego komentarza.
- [ ] Symulowana awaria push nie cofa komentarza ani powiadomienia wewnątrz aplikacji.

## Kontrola globalnego wyszukiwania desktopowego
- [ ] `npm run test:smoke:desktop-global-search` przechodzi.
- [ ] Pole jest widoczne na górze desktopu administratora i nie występuje w aplikacji mobilnej.
- [ ] Wyszukiwanie znajduje dane po kliencie, telefonie, adresie, modelu, numerze seryjnym, numerze zlecenia i monterze.
- [ ] Kliknięcie wyniku otwiera właściwy montaż, kontrahenta albo urządzenie.
- [ ] `Ctrl+K`, strzałki, Enter i Escape działają zgodnie z opisem.

## Kontrola desktopowego OCR tabliczek
- [ ] `npm run test:smoke:desktop-nameplate-ocr` przechodzi.
- [ ] Przycisk `Odczytaj OCR` jest widoczny tylko dla administratora w desktopie i tylko przy zdjęciu tabliczki.
- [ ] Wynik można poprawić przed zapisem; nic nie zapisuje się automatycznie bez zatwierdzenia.
- [ ] Model i numer trafiają do właściwej JZ/JW, a mobile nie importuje ani nie pokazuje OCR.
- [ ] Po wdrożeniu wykonano próbę na jednej prawdziwej tabliczce przed użyciem seryjnym.

## Paczka wydania ręczna
Po dwóch poprawnych przebiegach uruchom:

```bash
npm run zip:release
node scripts/verify-release.cjs --require-zip
```

Przy zmianach w zapisie montaży/urządzeń musi przejść `npm run test:smoke:job-multi-indoor`, `npm run test:smoke:job-device-type-switch`, `npm run test:smoke:job-device-spaces` oraz `npm run test:smoke:source-job-id-hotfix`, żeby typ `devices.source_job_id` i SQL hotfix nie wypadły z release. Przy zmianach w module SMS musi przejść też `npm run test:smoke:sms-log-cleanup`, żeby `admin_cleanup_sms_duplicate_logs` i migracja `sms-module-stage-9-log-cleanup.sql` nie wypadły z release. Przy zmianach w desktopowym układzie `Montaże` dopilnuj również `npm run test:smoke:desktop-jobs-layout-width`. Przy zmianach w module `Kalendarz` dopilnuj również `npm run test:smoke:calendar-width`.

ZIP musi być utworzony w katalogu `releases/` z jawnej listy plików, bez `zip -r`, i przejść weryfikację bez braków wersji, dokumentacji, katalogów `logs*`, plików `.log/.tmp` oraz plików roboczych. `verify:release` blokuje też częściowy katalog `dist` po nieudanym buildzie.

## E2E desktopowe

Pełne testy przeglądarkowe można uruchomić poza szybkim smoke:

```bash
npm run test:e2e:desktop
```

Testy działają na `VITE_SUPABASE_MODE=mock`, więc logowanie administratora i pracownika nie dotyka produkcyjnej bazy. Zależność `@playwright/test` jest wpisana w `package.json`; w nowym środowisku wykonaj `npm install` i doinstaluj Chromium komendą `npx playwright install chromium`.

Mobilny scenariusz dwóch sesji uruchamia:

```bash
npm run test:e2e:mobile
```

Ten sam mobilny E2E sprawdza dokumentację JZ/JW bez OCR: natywne otwarcie aparatu i galerii, kompaktowe pozycje bez stałych miniaturek, podgląd zdjęcia po kliknięciu, zdjęcia JZ i każdej JW oraz blokadę zakończenia zlecenia do czasu zapisania całego kompletu.


## Supabase / SQL GRANT
- Każdy nowy plik SQL z `create table` musi zawierać jawny `GRANT` dla właściwej roli Data API i `alter table ... enable row level security`.
- Dla tabel używanych bezpośrednio po zalogowaniu dajemy zwykle `authenticated, service_role`; dla tabel technicznych obsługiwanych przez Edge Function/RPC można dać tylko `service_role`.
- Przed ZIP-em uruchamiamy `npm run test:smoke:supabase-grants`. Ten smoke blokuje release, gdy tabela powstała bez GRANT/RLS.
- Do ręcznego audytu produkcji służy `supabase-grants-audit-wawis.sql`; najpierw uruchamiaj sekcję A, bo nic nie zmienia.

- `npm run test:smoke:destructive-rls`

- [ ] `npm run test:smoke:nameplate-rendering` — ramka kadrowania odpowiada obrazowi, a podglądy tabliczek używają `contain`.
