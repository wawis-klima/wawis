# RELEASE RESULT - Wawis 9.11

## Wersja
- 9.11

## Tryb
- desktop — obsługa różnych układów tabliczek bez wymuszania EAN-u.

## Zakres
- zachowano profil 9.10: `PC/EAN + Code 128/SN`,
- dodano drugi profil: nadrukowany kod modelu + pojedynczy Code 128 jako numer seryjny, bez obowiązkowego EAN-u,
- dodano skupiony OCR górnej części etykiety; model jest akceptowany wyłącznie, gdy odpowiada dokładnemu kodowi w katalogu Rotenso 9.02,
- model bez EAN-u jest automatycznie akceptowany po dwóch zgodnych przebiegach OCR albo po jednym odczycie o wysokiej pewności,
- ograniczone korekty OCR dotyczą wyłącznie markera jednostki (`X1 -> Xi`, `X0 -> Xo`) i są akceptowane tylko wtedy, gdy wynik istnieje w katalogu,
- brak EAN-u nie jest błędem, gdy model i numer seryjny są kompletne,
- znany kod modelu Rotenso nie może zostać omyłkowo uznany za numer seryjny,
- realny przypadek: `R35Xi R18` -> Rotenso Roni 3,5 kW, JW/indoor, katalogowy EAN `5905567609084`; Code 128 `140201BFT7N28261B000931` -> numer seryjny,
- wcześniejsze zabezpieczenia PC/EAN vs SN oraz Xi/JW, Xo/JZ, Xm/JZ pozostają aktywne,
- mobile bez zmian,
- brak nowego SQL.

## Kontrola
- `test:smoke:desktop-nameplate-layout-profiles`: PASS ×2,
- `test:smoke:desktop-nameplate-universal-reader`: PASS ×2,
- `test:smoke:desktop-nameplate-ean-separation`: PASS ×2,
- `test:smoke:nameplate-product-catalog`: PASS ×2,
- `test:smoke:desktop-nameplate-ai-barcode`: PASS ×2,
- `test:smoke:desktop-nameplate-automatic-fallback`: PASS ×2,
- `test:smoke:desktop-nameplate-ocr`: PASS ×2,
- `test:smoke:version`: PASS ×2,
- `verify:release`: PASS ×2,
- pełny Vite build: niepotwierdzony lokalnie — próba została przerwana błędem środowiska wykonawczego przed uzyskaniem wyniku instalacji/kompilacji,
- Playwright: nieuruchomiony lokalnie bez potwierdzonego builda; do potwierdzenia po wdrożeniu / w CI.

## Wdrożenie
1. Wdrożyć aplikację 9.11.
2. Dla 9.11 nie ma nowej migracji SQL.
3. Naprawa katalogu z 9.09 pozostaje jednorazowa; jeżeli została już uruchomiona, nie trzeba jej powtarzać dla 9.11.
