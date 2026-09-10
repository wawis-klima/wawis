# RELEASE RESULT - Wawis 9.08

## Wersja
- 9.08

## Tryb
- desktop — uproszczenie formularza nowego zlecenia i zagęszczenie lewego menu.

## Zakres
- w `Nowy montaż / zlecenie` ukryto cały blok urządzeń, ponieważ na etapie tworzenia administrator zapisuje dane klienta, adres, status, termin, komentarz i przydział monterów,
- nowe zlecenie może zostać zapisane z pustymi polami `device_model` i `device_serial_number`; istniejący mechanizm serializacji zwraca dla pustego urządzenia wartości puste/null,
- przy edycji istniejącego montażu sekcja urządzeń pozostaje dostępna — nie usunięto obsługi urządzeń, multi-split ani starszych danych,
- lewy sidebar desktopu ma bardziej zwartą typografię i geometrię: tekst pozycji 17 px zamiast 18 px, wysokość pozycji 52 px zamiast 58 px, mniejsze ikony i odstępy,
- szerokość sidebara i kolejność pozycji menu pozostają bez zmian,
- mobile bez zmian,
- brak nowej migracji Supabase.

## Kontrola
- test nowego formularza bez sekcji urządzeń oraz zachowania urządzeń w trybie edycji: PASS ×2,
- test kompaktowego sidebara i izolacji zmiany do desktopu: PASS ×2,
- test zapisu urządzeń / multi-split / zmiany typu urządzenia: PASS ×2,
- test desktop-only, menu bocznego i kalendarza: PASS ×2,
- test tworzenia oraz automatycznego powiązania kontrahenta: PASS ×2,
- test wersji i kompatybilności regex: PASS ×2,
- `verify:release`: PASS ×2,
- pełny Vite build i Playwright: niepotwierdzone lokalnie; instalacja zależności zatrzymała się przed kompilacją na błędzie rejestru npm `E404` dla `yallist` w środowisku wykonawczym.

## Wdrożenie
- brak SQL do uruchamiania,
- wdrożyć aplikację 9.08 standardowym workflow Vercel,
- po wdrożeniu warto potwierdzić wygląd sidebara na docelowej wysokości okna oraz zielony build/Playwright w CI.
