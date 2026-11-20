# RELEASE RESULT - Wawis 9.12

## Wersja
- 9.12

## Zakres
- desktop: odczyt tabliczek tylko przez kody kreskowe i istniejącą analizę AI,
- lokalny OCR/Tesseract usunięty z kodu produkcyjnego oraz z paczki (`src/modules/desktop-nameplate-ocr.js` i `public/ocr/`),
- EAN-13 i Code 128/39 traktowane wyłącznie jako twarde wyniki dekodera kodów kreskowych,
- twardy EAN/SN z kodu ma pierwszeństwo przed wynikiem AI,
- model Rotenso odczytany przez AI jest potwierdzany dokładnie względem katalogu; niepotwierdzony model AI nie może zostać automatycznie zapisany,
- zachowano rozdzielenie PC/EAN od SN oraz Xi/JW, Xo/JZ i Xm/JZ dla 214 kodów Rotenso,
- brak zmian mobile i brak nowego SQL.

## Kontrola wykonana lokalnie
- testy składni zmienionych modułów JS/CJS: PASS,
- `test:smoke:nameplate-product-catalog`: PASS x2,
- `test:smoke:desktop-nameplate-ocr` (historyczna nazwa testu; obecnie pilnuje braku OCR): PASS x2,
- `test:smoke:desktop-nameplate-ai-barcode`: PASS x2,
- `test:smoke:desktop-nameplate-read-resilience`: PASS x2,
- `test:smoke:desktop-nameplate-automatic-fallback`: PASS x2,
- `test:smoke:desktop-nameplate-ean-separation`: PASS x2,
- `test:smoke:desktop-nameplate-universal-reader`: PASS x2,
- `test:smoke:desktop-nameplate-layout-profiles`: PASS x2,
- `test:smoke:desktop-nameplate-source-persistence`: PASS x2,
- `test:smoke:device-save`, `test:smoke:job-device-type-switch`, `test:smoke:desktop-new-job-compact`, `test:smoke:client-voice`: PASS w kontroli regresji,
- `verify:release`: PASS x2 po końcowych zmianach.

## Build / Playwright
- pełny lokalny Vite build nie został wykonany: środowisko ma niekompletny katalog `node_modules/vite` i brakuje `node_modules/vite/bin/vite.js`, więc próba zakończyła się przed kompilacją aplikacji,
- finalny build i Playwright należy potwierdzić po poprawnym `npm ci` / w CI.

## Wdrożenie
- brak nowej migracji SQL,
- wymagany nadal działający `OPENAI_API_KEY` dla ręcznej funkcji „Odczytaj przez AI”.
