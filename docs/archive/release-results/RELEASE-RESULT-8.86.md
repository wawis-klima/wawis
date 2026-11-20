# RELEASE RESULT

## Wersja
- 8.86

## Tryb
- mobile — awaryjne przywrócenie stabilnej aplikacji

## Podsumowanie
- status źródeł: ZIELONY
- baza funkcjonalna: wersja 8.82
- wadliwe zmiany wizualne 8.83–8.85: WYCOFANE
- testy smoke: 79 skryptów × 2 przebiegi — OK
- `verify:release`: 2 przebiegi — OK
- kontrola składni Node: 197 plików — OK
- lokalny produkcyjny build: niewykonany z powodu braku pakietu Vite w dostępnym rejestrze środowiska
- obowiązkowy build po wgraniu: GitHub Actions / Vercel

## Przyczyna awarii 8.85
W wersji 8.85 przeniesiono ładowanie mobilnych arkuszy CSS z głównego bootstrapa do dynamicznie ładowanego modułu aplikacji. Na wdrożonym iPhonie kod React został uruchomiony, ale główny arkusz stylów nie został zastosowany, dlatego pojawiła się surowa strona HTML z domyślnym fontem szeryfowym.

## Naprawa 8.86
- przywrócono sprawdzony bootstrap z 8.82: aplikacja i oba mobilne arkusze CSS są ładowane razem w jednym `Promise.all` przed renderem Reacta,
- dodano minimalny styl awaryjny w `index.html`, aby nawet przy problemie z głównym CSS aplikacja nie wyświetliła ponownie surowej strony,
- dodano `test:smoke:mobile-style-bootstrap`, który blokuje zmianę kolejności ładowania CSS,
- dodano `test:smoke:dist-mobile-css`, który po produkcyjnym buildzie sprawdza obecność oraz zawartość CSS w `dist`,
- zachowano obsługę wielu adresów klienta z 8.81 oraz synchronizację/deduplikację zdjęć z 8.82,
- nie dodano nowych funkcji, migracji SQL ani zmian wyglądu.

## Zasada wdrożenia
Wersja 8.85 jest wycofana. Wersję 8.86 należy najpierw uruchomić jako Preview i sprawdzić ekran logowania oraz kartę montażu na iPhonie. Produkcję aktualizować dopiero po zielonym buildzie.
