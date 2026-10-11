# RELEASE RESULT — WAWIS 13.06

## Zmiana
- Naprawa mobilnego formularza urządzeń / tabliczek: okno „Zamknąć bez zapisu?” było umieszczone pod aktywnym kreatorem (oba overlaye miały z-index 9999).
- Dialog potwierdzenia jest teraz nad kreatorem (z-index 15000), dzięki czemu „Zamknij bez zapisu” i „Wróć” są klikalne.
- Nie usunięto ochrony niezapisanych zmian ani nie zmieniono danych, OCR, funkcji zapisu czy uprawnień.

## Weryfikacja
- Automatyczny Playwright iPhone: wejście przez gest w prawo oraz przez zwykłe „Tabliczki”; „Wstecz”, „Zamknij”, anulowanie i potwierdzenie, test hit-test warstwy.
- Wymagane przed połączeniem do main: zielony CI dokładnego SHA (targeted-checks / mobile E2E / release gates / build).
- Vercel READY dla commit po merge i widoczna wersja 13.06: **niezweryfikowane**.
- Fizyczny iPhone: **do potwierdzenia**.
