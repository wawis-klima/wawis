# RELEASE RESULT

## Wersja
- 13.01

## Tryb
- mobile

## Zakres
- Administrator / mobilna edycja montażu: Zamknij w jednym wierszu z nagłówkiem, pola 32 px/13 px, mniejsze odstępy; komentarz administratora 110 px zamiast 54 px.
- Standardowy iPhone: cały formularz razem z Zapisz zmiany na jednym ekranie; dla mniejszych ekranów awaryjne przewijanie z dostępnym zapisem.
- Pracownik, tworzenie nowego montażu, desktop, dane klienta, edycja i kalendarz bez zmian.

## Dowód
- Wymagane: zielone CI na dokładnym SHA, test pomiaru realnego rozkładu formularza i widoczności Zapisz zmiany, pozostałe regresje Playwright, testy współbieżności, build, Vercel READY.
- Fizyczny iPhone użytkownika: wizualna kontrola po aktualizacji.
