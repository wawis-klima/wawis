## Dokładny odczyt tabliczek i AI (8.75)
- `src/modules/desktop-nameplate-barcode.js` — EAN-13, Code 128 i klasyfikacja wyniku.
- `src/data/rotenso-ean-catalog-v9.02.js` — wbudowany katalog 183 aktualnych EAN-ów Rotenso 2026/2027 oraz 31 zachowanych starszych rewizji i aliasów, działający także bez odpowiedzi Supabase.
- `src/modules/nameplate-product-catalog.js` — centralny katalog Supabase, import CSV/XLSX, wbudowany fallback i eksport katalogu Rotenso.
- `src/modules/desktop-nameplate-ai.js` — przygotowanie kadru, wywołanie serwerowego endpointu i normalizacja wyniku.
- `api/read-nameplate-ai.js` — uwierzytelniona funkcja Vercela wywołująca OpenAI Responses API.
- `DesktopNameplateOcrButton.jsx` — źródło każdego pola i jawne zatwierdzenie zapisu.
- Mobile pozostaje bez OCR-u i AI.

## Kolorowa pewność OCR pól (8.68)
- `DesktopNameplateOcrButton` pokazuje oddzielny status producenta, modelu i numeru seryjnego.
- `assessOcrFieldConfidences()` zwraca poziomy `high`, `medium`, `low`, procent i komunikat.
- Zielony oznacza wysoką pewność, pomarańczowy konieczność kontroli, czerwony brak lub podejrzany odczyt.
- Ręczna edycja nie jest traktowana jako automatycznie pewna; pole przechodzi na pomarańczowy status do wizualnego porównania.
- Funkcja jest desktop-only i nie występuje w aplikacji pracownika.

# Desktop / Mobile — struktura wersji 8.27

## Globalne wyszukiwanie administratora (8.66)
- Komponent: `src/components/desktop/GlobalDesktopSearch.jsx`.
- Indeks i ranking wyników: `src/modules/global-search.js`.
- Pole jest renderowane przez `AdminDesktopShell` nad aktywnym modułem i nie jest obecne w `src/mobile791`.
- Źródła danych: `jobs`, pełny katalog kontrahentów, katalog `devices` i profile monterów.
- Nawigacja z wyniku jest obsługiwana w `src/App.jsx`: montaż -> `Montaże`, kontrahent -> `Kontrahenci`, urządzenie -> `Urządzenia` z otwartym panelem rekordu.
- `DevicesPanel` przyjmuje `requestedDeviceId`, żeby po przejściu z wyszukiwarki zaznaczyć konkretny rekord.


## Zasada wydania

Wersja 8.27 jest wydaniem **desktop-only**. Widok mobilny jest zamrożony: nie zmieniamy komponentów, styli ani logiki w `src/mobile791`, dopóki nie ma osobnego zlecenia na mobile.

## Desktop administratora

Aktywny desktop administratora korzysta z głównego katalogu `src/`:

- `src/App.jsx` — logika aplikacji desktop/admin i wybór modułów.
- `src/main.jsx` — przełącznik startowy: desktop ładuje `src/App.jsx`, mobile ładuje `src/mobile791/App.jsx`.
- `src/components/layout/AdminDesktopShell.jsx` — biały sidebar, logo, menu i wersja aplikacji.
- `src/components/layout/AppAuthenticatedLayout.jsx` — opakowanie modułów oraz split layout dla desktopu.
- `src/components/JobsPanel.jsx` i `src/components/jobs/DesktopJobsLayout.jsx` — desktopowy moduł `Montaże`.
- `src/components/contractors/ContractorsPanel.jsx` — desktopowy moduł `Kontrahenci`.
- `src/components/devices/DevicesPanel.jsx` — desktopowy moduł `Urządzenia`.
- `src/styles.css` oraz `src/styles/desktop-jobs-table.css` — style desktopowe używane przez administratora.

## Mobile zamrożone

Kod mobilny jest odseparowany w katalogu:

- `src/mobile791/App.jsx`
- `src/mobile791/components/**`
- `src/mobile791/modules/**`
- `src/mobile791/styles.css`
- `src/mobile791/styles/desktop-jobs-table.css`
- `src/mobile791/version.js`

Wydanie 8.27 nie zmienia tych plików. Desktopowe poprawki CSS trafiają do `src/styles.css`, a nie do `src/mobile791/styles.css`.

## Wspólne / konfiguracyjne

Pliki spoza `src/mobile791`, które mogą zmieniać się przy wydaniu desktopowym:

- `app-version.json`, `package.json`, `package-lock.json`, `src/version.js` — wersja desktopowej paczki.
- `README.md`, `CHANGELOG.md`, `RELEASE-RESULT*.md` — dokumentacja wydania.
- `scripts/*.cjs` — smoke/verify/release.
- `*.sql` — migracje i naprawy Supabase, z obowiązkowym jawnym `GRANT` przy nowych tabelach.

## Ujednolicony desktopowy szkielet

Wersja 8.27 standaryzuje wspólne elementy w `Montaże`, `Kontrahenci` i `Urządzenia`:

- ten sam biały sidebar i szerokość robocza,
- kompaktowe nagłówki modułów,
- spójne toolbary filtrów i akcji,
- ten sam styl kart tabel,
- sticky nagłówki list,
- takie samo podświetlenie zaznaczonego wiersza,
- jedna proporcja: lista po lewej + panel szczegółów po prawej,
- przewijanie listy i prawego panelu bez rozjeżdżania całej strony.

## Smoke test

Dla tej zmiany dodano:

```bash
npm run test:smoke:desktop-unified-layout
```

Test sprawdza, że:

- `src/mobile791` nadal istnieje jako osobny, zamrożony katalog,
- desktop i mobile są ładowane osobno z `src/main.jsx`,
- `Kontrahenci` i `Urządzenia` mają `desktopModuleShell`,
- `Montaże`, `Kontrahenci` i `Urządzenia` są objęte wspólnymi regułami layoutu w `src/styles.css`,
- prawy panel w tych modułach używa wspólnej szerokości `--wawisDesktopPanelWidth`.

## OCR tabliczek 8.65
- Wyłącznie desktop administratora, w `JobDetailsPanel` przy zdjęciu rozpoznanym jako tabliczka.
- Komponent: `src/components/desktop/DesktopNameplateOcrButton.jsx`.
- Lokalny silnik: `src/modules/desktop-nameplate-ocr.js` + `public/ocr/*`.
- Zapis JZ/JW: `src/modules/desktop-nameplate-ocr-save.js`.
- Brak importów i przycisków OCR w `src/mobile791`.
