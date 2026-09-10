# RELEASE RESULT

## Wersja
- 8.91

## Tryb
- desktop — poprawka odczytu tabliczek znamionowych

## Podsumowanie
- dodano EAN `5905567600821` dla `Rotenso Imoto 5,0 kW (I50Xo R14)`,
- po niepełnym odczycie kodów uruchamiany jest lokalny OCR nadruku modelu i numeru seryjnego,
- wykrycie jednostki zewnętrznej w slocie JW lub wewnętrznej w slocie JZ blokuje automatyczne wpisanie danych i pokazuje komunikat,
- nieznany EAN nie pozostawia już pustych pól bez wyjaśnienia,
- brak zmian w mobile, synchronizacji zdjęć, komentarzach, adresach klientów i Supabase,
- nowa migracja SQL: brak.

## Kontrola lokalna
- `test:smoke:desktop-nameplate-ai-barcode` — OK,
- `test:smoke:desktop-nameplate-ocr` — OK,
- `verify:release` — OK,
- kontrola składni zmienionego komponentu i modułów — OK,
- produkcyjny build i pełny Playwright: GitHub Actions / Vercel.

## Zasada wdrożenia
Publikować po zielonym wyniku GitHub Actions. Nie ma nowego SQL do uruchomienia.
