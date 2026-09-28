# RELEASE RESULT

## Wersja
- 11.69

## Zakres
- automatyczny układ dwukolumnowy sekcji urządzeń od 3 kompletów JW/JZ
- nierozdzielanie JW i JZ jednego kompletu między kolumnami
- utrzymanie protokołu z trzema kompletami na jednej stronie A4
- brak ostrzeżenia o niepotwierdzonych monterach przy zapisanym starszym PDF
- pracownik z dostępem do zakończonego montażu może od razu uzupełnić i ponownie podpisać zapisany protokół
- historyczna lista monterów jest odtwarzana tylko do dokumentu, bez automatycznej zmiany jobs.installer_ids
- potwierdzenie monterów pozostaje wymagane tylko przy tworzeniu pierwszego protokołu starego montażu bez zapisanego PDF
- bez zmian w Supabase, RLS, Storage i Edge Functions

## Kontrola regresji
- render fixture sprawdza 3 komplety JW/JZ, dwie kolumny i dokładnie jedną stronę PDF
- smoke pilnuje, że zapisany protokół omija blokadę monterów przy edycji i ponownym podpisie
- akcje Drukuj / Zapisz PDF / Wyślij korzystają nadal z istniejącego zapisanego pliku
- układ 1–2 kompletów pozostaje jednokolumnowy
- pełny refresh nie nadpisuje już komentarzy i zdjęć szczegółów pobranych w trakcie odświeżania

## Wynik wydania
- WAWIS PR checks: PENDING
- produkcyjny build: PENDING
- Vercel: PENDING
- merge: PENDING
