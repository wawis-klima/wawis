# RELEASE RESULT

## Wersja
- 9.01

## Tryb
- desktop — rozszerzenie katalogu EAN/GTIN Rotenso

## Zakres
- dodano oficjalny EAN Teta Mirror TM35Xi R16: `5905567601200`,
- dodano potwierdzony alias z etykiety urządzenia `2411950928074` dla TM35Xi R16,
- dodano agregaty Hiro Multi S-Line: H40Xm2, H50Xm2, H50Xm3, H60Xm3, H70Xm3, H80Xm4, H100Xm4, H120Xm5,
- dodano agregaty Hiro Multi N-Line: HN40Xm2, HN50Xm2, HN70Xm3, HN90Xm4, HN120Xm5,
- dodano agregaty Hiro Multi HP-Line: HHP50Xm2, HHP70Xm3,
- katalog wbudowany zwiększono z 92 do 109 kodów,
- dodano idempotentny seed `nameplate-product-catalog-multi-teta-seed-v9.01.sql`,
- brak zmian w mobile, zdjęciach, komentarzach, klientach i strukturze istniejących tabel Supabase.

## Kontrola lokalna
- podstawowy smoke całej aplikacji: OK ×2,
- test katalogu EAN/GTIN: OK ×2+,
- test desktopowego OCR: OK ×2,
- test automatycznego fallbacku OCR dla brakującego SN: OK ×2,
- test utrzymania zdjęcia i źródła OCR: OK ×2,
- test numeru wersji: OK ×2,
- `verify:release`: OK ×2,
- seed SQL: 17 unikalnych rekordów, poprawne sumy kontrolne EAN-13, dozwolone `source_type`,
- pełny build i Playwright: wymagają zielonego wyniku GitHub Actions.

## Wdrożenie
- aplikacja rozpoznaje 109 pozycji z katalogu wbudowanego natychmiast po wdrożeniu,
- aby nowe pozycje były także dostępne w centralnym katalogu Supabase, uruchom `nameplate-product-catalog-multi-teta-seed-v9.01.sql`,
- jeżeli bazowa tabela katalogu z wersji 8.92 już istnieje, nie uruchamiaj ponownie starej migracji.
