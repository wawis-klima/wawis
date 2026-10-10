# RELEASE RESULT

## Wersja
- 13.02

## Tryb
- mobile

## Zakres
- Mobilny administrator / Edytuj montaż: sam mikrofon obok nagłówka i Zamknij, bez nachodzenia elementów.
- Automatycznie jedno- lub dwuwierszowa nazwa klienta; Telefon i NIP po 50% szerokości, odstępy 8px w poziomie i 5px w pionie.
- Komentarz administratora 112px na normalnym iPhonie; na krótszych ekranach zachowano przewijanie i dostęp do Zapisz zmiany.
- Bez zmiany danych, OCR, protokołów, edycji pracownika, tworzenia montażu i desktopu.

## Dowód
- Wymagane: zielone CI na dokładnym SHA, geometrię Playwright iPhone (długa nazwa, dwa pola, mikrofon bez podpisu, komentarz), regresje współdziałania, Closure Gate i build, Vercel READY.
- Fizyczny iPhone użytkownika pozostaje końcowym sprawdzeniem wyglądu.
