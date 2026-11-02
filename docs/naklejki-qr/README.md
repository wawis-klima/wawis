# Naklejki QR WAWIS — partia 1 (02.11.2026)

- 162 unikalnych kodów (3 strony A4, 6 × 9 naklejek 30 × 30 mm), lista: `partia-1-kody.csv`.
- QR zawiera adres `https://wawis-klima.vercel.app/u/<KOD>`; pod kodem numer `XXXX-XXXX` do wpisania ręcznie.
- Alfabet bez znaków mylących (0/O, 1/I/L), kody losowe (`secrets`), korekcja błędów QR poziom Q.
- Kontrola: każdy z 162 kodów odczytany z wydruku PDF i z Worda (render 300 dpi, dekoder WeChat/OpenCV).
- Decyzje właściciela: naklejka przypisana do urządzenia; instalacja multi = jedna naklejka na cały zestaw.
- Trasa `/u/<KOD>` w aplikacji i tabela naklejek w bazie — do zbudowania (wymaga SQL właściciela).
  Dopóki trasy nie ma, zeskanowanie aparatem iPhone'a otworzy stronę błędu — naklejki są ważne, kody zostaną zaimportowane z tego pliku.
