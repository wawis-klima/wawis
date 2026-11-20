# RELEASE RESULT - Wawis 9.16

## Wersja
- 9.16

## Zakres
- uproszczono mobilne tworzenie nowego montażu przez administratora,
- po wejściu w `+` i formularz `Nowy montaż / zlecenie` sekcja `Urządzenia w montażu` nie jest renderowana,
- w nowym montażu nie pokazujemy typu single/multi, modeli JW/JZ, numerów seryjnych ani zdjęć tabliczek znamionowych,
- zapis nowego zlecenia działa bez danych urządzenia,
- po zapisaniu zlecenia urządzenia nadal są dostępne przy edycji istniejącego montażu,
- osobny mobilny kreator urządzeń/tabliczek pozostaje bez zmian,
- blokada zakończenia montażu wymagająca tabliczek JW/JZ pozostaje bez zmian,
- desktop nie został zmieniony.

## Supabase
- brak nowej migracji SQL dla 9.16,
- wersja nie zmienia struktury bazy danych,
- wcześniejsze wymagania 9.14 dotyczące `completed_at` i push pozostają niezależne od tej zmiany.

## Kontrola wykonana lokalnie
Po dwa przebiegi PASS:
- `test:smoke:mobile-new-job-no-devices`,
- `test:smoke:desktop-new-job-compact`,
- `test:smoke:mobile-admin-header`,
- `test:smoke:version`,
- `test:smoke:mobile-ui-copy`,
- `test:smoke:nameplate-finish-verification`.

Nowy test 9.16 sprawdza, że sekcja urządzeń w mobilnym formularzu jest objęta warunkiem `editingJobId`, a osobny `MobileDeviceWizard` nadal istnieje. Test został dodany do pełnego i mobilnego release runnera.

## Build / Playwright
- paczka źródłowa release nie zawiera `node_modules`,
- w bieżącym środowisku nie udało się uruchomić pełnego Vite/Playwright, ponieważ przygotowanie brakujących zależności npm nie może zostać zakończone,
- nie deklarujemy więc lokalnego PASS pełnego builda przeglądarkowego; kontrola tej zmiany opiera się na testach regresyjnych źródła i kontroli release.

## Wdrożenie
Dla samej zmiany 9.16 nie ma nowego SQL. Po rozpakowaniu paczki należy podpiąć katalog do właściwego projektu `wawis-klima` i wykonać `vercel.cmd --prod`.
