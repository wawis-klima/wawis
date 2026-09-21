# RELEASE RESULT - Wawis 9.10

## Wersja
- 9.10

## Tryb
- desktop — przebudowa odczytu tabliczek: kod kreskowy jako źródło nadrzędne, OCR bez zgadywania.

## Zakres
- dodano uniwersalny czytnik EAN-13 i Code 128 oparty na `barcode-detector` 3.2.1 / ZXing WebAssembly, uruchamiany leniwie podczas skanu,
- czytnik działa jako pierwsza warstwa również w przeglądarkach bez natywnego `BarcodeDetector`; natywny czytnik, własny EAN-13 i OCR pozostają warstwami awaryjnymi,
- obraz jest analizowany w pełnym kadrze oraz w zachodzących na siebie pasach górnych/środkowych/dolnych,
- EAN-13 jest traktowany jako PC/EAN, a Code 128 jako kandydat SN; numer z kodu kreskowego ma najwyższy priorytet,
- automatyczny OCR numeru seryjnego nie może wypełnić pola na podstawie pojedynczego odczytu; wymagane są co najmniej dwa identyczne odczyty jawnie oznaczonego pola SN/Serial,
- niepewne fragmenty OCR są zachowywane wyłącznie diagnostycznie i nie są automatycznie wpisywane,
- usunięto UI-owy fallback wybierający najdłuższy alfanumeryczny ciąg z surowych wyników,
- realny przypadek I35Xi R14: EAN `5905567600791`, pełny Code 128/SN `540S25420034B110171916`, błędny OCR `0034B110171918` — test wymusza wybór pełnego Code 128 i odrzucenie fragmentu,
- poprawki 9.09 dla `Xi -> JW`, `Xo -> JZ`, `Xm -> JZ` oraz oficjalnego katalogu 214 kodów pozostają aktywne,
- mobile bez zmian funkcjonalnych,
- brak nowego SQL.

## Kontrola
- `test:smoke:desktop-nameplate-universal-reader`: PASS ×2,
- `test:smoke:desktop-nameplate-ean-separation`: PASS ×2,
- `test:smoke:desktop-nameplate-ai-barcode`: PASS ×2,
- `test:smoke:desktop-nameplate-automatic-fallback`: PASS ×2,
- `test:smoke:nameplate-product-catalog`: PASS ×2,
- `test:smoke:desktop-nameplate-ocr`: PASS ×2,
- `test:smoke:desktop-nameplate-read-resilience`: PASS ×2,
- regresja nowego zlecenia bez urządzeń, zapisu urządzeń, multi-split, zmiany typu urządzenia, głosu klienta i sidebara: PASS ×2,
- `test:smoke:version`: PASS ×2,
- `verify:release`: PASS ×2,
- pełny Vite build: niepotwierdzony lokalnie — próba `npm run build` oraz samo `prepare:deps` zostały przerwane błędem środowiska wykonawczego przed uzyskaniem wyniku instalacji/kompilacji,
- Playwright: nieuruchomiony lokalnie bez potwierdzonego builda; do potwierdzenia po wdrożeniu / w CI.

## Wdrożenie
1. Wdrożyć aplikację 9.10.
2. Dla 9.10 nie ma nowej migracji SQL.
3. Jeżeli `nameplate-product-catalog-repair-official-v9.09.sql` został już uruchomiony przy 9.09, nie uruchamiać nic dodatkowego.
