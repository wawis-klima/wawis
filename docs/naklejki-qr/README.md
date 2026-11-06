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
