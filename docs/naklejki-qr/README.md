# Naklejki QR WAWIS — partia 1 (02.11.2026)

- 162 unikalnych kodów (3 strony A4, 6 × 9 naklejek 30 × 30 mm), lista: `partia-1-kody.csv`.
- QR zawiera adres `https://wawis-klima.vercel.app/u/<KOD>`; pod kodem numer `XXXX-XXXX` do wpisania ręcznie.
- Alfabet bez znaków mylących (0/O, 1/I/L), kody losowe (`secrets`), korekcja błędów QR poziom Q.
- Kontrola: każdy z 162 kodów odczytany z wydruku PDF i z Worda (render 300 dpi, dekoder WeChat/OpenCV).
- Decyzje właściciela: naklejka przypisana do urządzenia; instalacja multi = jedna naklejka na cały zestaw.
- Trasa `/u/<KOD>` w aplikacji i tabela naklejek w bazie — do zbudowania (wymaga SQL właściciela).
  Dopóki trasy nie ma, zeskanowanie aparatem iPhone'a otworzy stronę błędu — naklejki są ważne, kody zostaną zaimportowane z tego pliku.

## Partia 2 (02.11.2026)
- Kolejne 162 kody (`partia-2-kody.csv`), wygenerowane z wykluczeniem partii 1 (`WAWIS_QR_EXCLUDE`); brak powtórzeń między partiami.
- Kontrola odczytu: PDF 162/162, Word 162/162.
- Decyzja właściciela: pracownicy przypisują naklejki przy montażu, ale nie jest to obowiązkowe.

## Partia 2 — wersja „ZGŁOŚ AWARIĘ LUB SERWIS” (06.11.2026)
- Prośba właściciela: oprócz „WAWIS Klimatyzacja” większy napis „ZGŁOŚ AWARIĘ / LUB SERWIS” (niebieski, 2 linie).
- Te same 162 kody co `partia-2-kody.csv` (zgodne z bazą); QR 14,5 mm, korekcja M (29 modułów, moduł 0,5 mm).
- Generator: `gen_v2_zglos.py <csv> <katalog> <nazwa>` + `make_docx_v2_zglos.js <katalog> <nazwa>`.
- Kontrola odczytu: PDF 162/162, Word 162/162.
- Uwaga: publiczna strona zgłoszenia dla klienta jeszcze nie istnieje — skan bez logowania prowadzi do logowania WAWIS.

## Partia 2 — wersja 35 × 30 mm, napis w jednej linii (06.11.2026)
- Prośba właściciela: naklejka 3,5 × 3 cm, czarny „ZGŁOŚ AWARIĘ LUB SERWIS” w jednej linii (DejaVu Sans Condensed Bold 6,4 pt, 32,2 mm).
- Te same 162 kody; A4 5 × 9 = 45 naklejek na stronę, 4 strony (ostatnia 27). QR 16 mm, korekcja M, moduł 0,55 mm.
- Word: każda naklejka jako obraz 600 dpi (wygląd identyczny z PDF niezależnie od czcionek).
- Generator: `gen_v3_zglos_35x30.py` + `make_docx_v3_zglos_35x30.js`. Kontrola odczytu: PDF 162/162, Word 162/162.

## Partia 2 — wersja „ZGŁOŚ” / „AWARIĘ LUB SERWIS” (06.11.2026, obecna)
- Prośba właściciela: „ZGŁOŚ” w pierwszej linii, „AWARIĘ LUB SERWIS” pod spodem (czarne, 7,6 pt), numer pod kodem o połowę mniejszy (3,7 pt).
- 35 × 30 mm, te same 162 kody, QR 15 mm (moduł 0,52 mm), 4 strony A4. Word: `make_docx_v3_zglos_35x30.js` (obrazy 600 dpi).
- Kontrola odczytu: PDF 162/162, Word 162/162.

## Partia 2 — uzupełnienie do 4 pełnych stron (06.11.2026)
- 18 nowych kodów (`partia-2-uzupelnienie-kody.csv`, nr 163–180), bez powtórzeń z partiami 1 i 2; w bazie jako partia 2 (migracja 20261106090000).
- Wydruk: `gen_v5_zglos.py <katalog> <nazwa> partia-2-kody.csv partia-2-uzupelnienie-kody.csv` → 180 naklejek, 4 pełne strony. Kontrola odczytu: PDF 180/180, Word 180/180.
