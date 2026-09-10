# RELEASE RESULT

## Wersja
- 8.88

## Tryb
- mobile — naprawa tabeli urządzeń na stabilnej bazie 8.86

## Podsumowanie
- zakres funkcjonalny: wyłącznie mobilna sekcja `Urządzenia i tabliczki`
- baza aplikacji: stabilna wersja 8.86
- logika zdjęć i kolejki offline: bez zmian względem 8.82
- wiele adresów klienta: zachowane z 8.81
- desktop i Supabase: bez zmian
- nowa migracja SQL: brak

## Przyczyna błędu 8.87
Telefon pobierał nową strukturę komponentu, ale krytyczne reguły tabeli były dopisane wyłącznie do osobnego `styles.css`. Na iPhonie pozostała starsza kopia arkusza, dlatego pojawiły się nowe napisy kolumn ułożone przez stary pionowy CSS.

## Naprawa 8.88
- tabela ma pięć prawdziwych kolumn: `Urządzenie`, `Model / moc`, `Tabliczka`, `Status`, `Akcje`,
- krytyczny arkusz tabeli znajduje się w `mobile-device-table-v888.css.js`,
- `JobDetailsPanel` osadza go przez znacznik `<style>` dostarczany razem z aktualizowanym fragmentem JavaScript,
- globalny `styles.css` z 8.86 nie został zmieniony, więc poprawka nie może rozbić pozostałych ekranów,
- test `test:smoke:mobile-device-table` sprawdza strukturę tabeli, osadzenie stylu, kolory JZ/JW, pięć kolumn i brak zależności od globalnego CSS.

## Kontrola lokalna
- testy smoke: 79 skryptów bez zewnętrznych zależności × 2 przebiegi — OK
- `verify:release`: 2 przebiegi — OK
- test składni JSX/JS: TypeScript parser — OK
- render Chromium komponentu na szerokości 430 px — OK; 5 kolumn, brak przepełnienia
- produkcyjny build Vite: GitHub Actions / Vercel z dostępem do npm
- końcowy ZIP: 452 pliki — kontrola integralności OK

## Zasada wdrożenia
Publikować dopiero po zielonym wyniku GitHub Actions. Po wdrożeniu całkowicie zamknąć PWA na iPhonie i uruchomić ją ponownie.
