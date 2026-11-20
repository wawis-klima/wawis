# RELEASE RESULT - Wawis 9.09

## Wersja
- 9.09

## Tryb
- desktop — krytyczna poprawka jednoznacznego rozdzielenia PC/EAN, SN oraz typu JW/JZ.

## Zakres
- EAN z lokalnego OCR może powstać wyłącznie z tekstu oznaczonego `PC/EAN`, `EAN` albo `GTIN`; usunięto wyszukiwanie poprawnych 13-cyfrowych okien w całym tekście tabliczki,
- `printed_text` pochodzący z `SN` i numeryczny `Code 128` nie są traktowane jako EAN-13,
- realny przypadek I35Xi R14 odczytuje `PC/EAN 5905567600791` oraz `SN 540S25420034B110171916` jako dwa oddzielne pola,
- realny przypadek I35Xo R14 / EAN `5905567600807` jest klasyfikowany jako `outdoor / JZ`,
- naprawiono błąd wielkości liter `JZ` vs `jz` przy zapisie potwierdzonego produktu do katalogu,
- kod modelu jest nadrzędny przy normalizacji typu jednostki: `Xi -> indoor/JW`, `Xo -> outdoor/JZ`, `Xm2..Xm5 -> outdoor/JZ`,
- wbudowany oficjalny katalog Rotenso 9.02 jest nadrzędny dla znanych EAN-ów i nie jest nadpisywany przez rekordy `confirmed_scan`,
- `saveConfirmedNameplateProduct` pomija zapis dla oficjalnych EAN-ów wbudowanego katalogu,
- dodano `nameplate-product-catalog-repair-official-v9.09.sql`, który idempotentnie przywraca 183 oficjalne bieżące pozycje Rotenso w centralnym katalogu,
- mobile bez zmian.

## Kontrola
- `test:smoke:desktop-nameplate-ean-separation`: PASS ×2 — realne przypadki I35Xi/I35Xo, izolacja PC/EAN od SN oraz zgodność JW/JZ wszystkich 214 kodów,
- `test:smoke:desktop-nameplate-ai-barcode`: PASS ×2,
- `test:smoke:desktop-nameplate-automatic-fallback`: PASS ×2,
- `test:smoke:nameplate-product-catalog`: PASS ×2,
- `test:smoke:desktop-nameplate-ocr`: PASS ×2,
- `test:smoke:desktop-nameplate-read-resilience`: PASS ×2,
- testy regresji nowego zlecenia, zapisu urządzeń, multi-split, zmiany typu i głosu klienta: PASS ×2,
- `test:smoke:version`: PASS ×2,
- `verify:release`: PASS ×2,
- pełny Vite build: niepotwierdzony lokalnie; próba `npm run build` zakończyła się błędem środowiska wykonawczego przed uzyskaniem wyniku kompilacji,
- Playwright: nieuruchomiony lokalnie bez potwierdzonego builda; do potwierdzenia w Vercel/GitHub Actions.

## Wdrożenie
1. Wdrożyć aplikację 9.09.
2. Jednorazowo uruchomić w Supabase SQL Editor `nameplate-product-catalog-repair-official-v9.09.sql`, aby naprawić ewentualne rekordy centralnego katalogu uszkodzone przez wcześniejszy błąd JZ/JW.
3. Skrypt jest idempotentny, nie zmienia schematu i nie usuwa dodatkowych pozycji spoza oficjalnych 183 bieżących EAN-ów.
