# WAWIS — stałe zasady projektu i bramka wydania

Ten plik jest nadrzędnym źródłem zasad dla każdej kolejnej wersji aplikacji WAWIS. Nie zastępuje `RELEASE-CHECKLIST.md`; określa warunki, których nie wolno pominąć nawet przy małej poprawce.

## 1. Zasada źródła prawdy

- Punktem startowym jest zawsze ostatnia poprawna wersja z gałęzi `main`.
- Przed rozpoczęciem zmian trzeba jawnie określić zakres: `mobile`, `desktop` albo `full`.
- Nie przenosimy funkcji między mobile i desktopem bez osobnej decyzji.
- Nie odtwarzamy założeń wyłącznie z pamięci rozmowy. Najpierw czytamy ten plik, `RELEASE-CHECKLIST.md`, aktualny `README.md`, `CHANGELOG.md` i odpowiedni kod.
- Każda regresja, która została naprawiona i może wrócić, powinna mieć test smoke lub E2E.

## 2. Diagnostyka jest obowiązkową częścią wydania

### Przed zmianą

Przed rozpoczęciem pracy sprawdzamy Diagnostykę / historię zdarzeń z ostatnich 24 godzin i zapisujemy stan początkowy:

- nowe błędy i ostrzeżenia,
- błędy powtarzające się,
- moduł źródłowy,
- ostatni czas wystąpienia,
- timeouty,
- błędy Supabase, sieci i synchronizacji,
- zdjęcia i tabliczki,
- protokoły,
- push,
- kolejki offline.

Celem jest rozróżnienie błędów istniejących przed zmianą od błędów wprowadzonych przez nowe wydanie.

### Przed publikacją

Ponownie sprawdzamy Diagnostykę. Niewyjaśniony nowy błąd techniczny oznacza `NO-GO`. Znany fałszywy alarm można pominąć tylko wtedy, gdy jego przyczyna jest rozpoznana i opisana.

### Po publikacji

Po wdrożeniu produkcyjnym sprawdzamy Diagnostykę jeszcze raz i porównujemy ją ze stanem sprzed zmiany. Nowy błąd lub wyraźny wzrost częstotliwości istniejącego błędu oznacza, że wydanie nie jest zamknięte i wymaga poprawki technicznej.

## 3. Bramka GO / NO-GO

Wydanie ma status `GO` wyłącznie wtedy, gdy wszystkie poniższe warunki są spełnione:

1. Zakres wydania jest jawny.
2. Numer wersji jest spójny we wszystkich aktywnych miejscach.
3. `README.md` i `CHANGELOG.md` opisują rzeczywiste zmiany i nie zawierają placeholdera dla aktualnej wersji.
4. Testy odpowiednie dla zmienianego obszaru i testy regresji są zielone.
5. `verify:release` przechodzi.
6. Zmiany Supabase mają sprawdzone RLS i właściwe `GRANT`.
7. Build i `verify:bundle` przechodzą, jeśli środowisko pozwala na build.
8. Jeżeli build jest celowo pomijany w sandboxie, `RELEASE-RESULT.md` musi oznaczać go jawnie jako `POMINIĘTO` z powodem.
9. Diagnostyka przed publikacją nie zawiera niewyjaśnionego nowego błędu.
10. Produkcyjna wersja, Service Worker/cache oraz najważniejsze ścieżki zmienionego obszaru zostały sprawdzone po wdrożeniu.
11. Diagnostyka po wdrożeniu została ponownie sprawdzona.
12. Finalny ZIP wydania został wysłany na Google Drive do `Aplikacja/Wersje` i po wysłaniu zweryfikowany przez ponowne odczytanie folderu.

`NO-GO` obowiązuje przy czerwonym teście, niespójnym numerze, placeholderze dokumentacji aktualnego wydania, niewyjaśnionym nowym błędzie diagnostycznym, nierozwiązanej regresji albo braku zweryfikowanej kopii ZIP na Google Drive.

## 4. Minimalna kontrola po wdrożeniu

W zależności od zakresu sprawdzamy na produkcji co najmniej:

- uruchomienie aplikacji,
- numer wersji,
- Service Worker i odświeżenie cache,
- logowanie i rolę użytkownika,
- zapis i odczyt danych w zmienionym module,
- brak białego ekranu / freeze,
- mobile na iPhonie, jeżeli zmiana dotyczy mobile,
- desktop, jeżeli zmiana dotyczy desktopu,
- zdjęcia, synchronizację, protokoły, push i Supabase, jeżeli zmiana ich dotyczy.

## 5. Dokumentacja wydania

- `README.md` zawiera aktualną wersję i krótki opis ostatniej poprawki.
- `CHANGELOG.md` zawiera konkretny opis aktualnej wersji.
- `RELEASE-RESULT.md` ma ten sam numer co `app-version.json`.
- Placeholder generowany przy podbiciu wersji jest stanem przejściowym i musi zostać zastąpiony przed zatwierdzeniem wydania.
- Ograniczeń testu lub środowiska nie wolno przemilczać; zapisujemy je w raporcie wydania.

## 6. Obowiązkowa kopia ZIP na Google Drive

Każde zakończone wydanie musi mieć finalną paczkę ZIP w Google Drive:

- folder docelowy: `Aplikacja/Wersje`,
- identyfikator folderu `Wersje`: `1eufcE1gnbfw7t2IMmJwbcicrkaiaqu0S`,
- nazwa pliku: `klima-app-v<WERSJA>.zip`, np. `klima-app-v10.60.zip`,
- wysyłamy wyłącznie finalny ZIP po zakończeniu testów i weryfikacji paczki,
- po wysłaniu ponownie odczytujemy folder `Wersje` i potwierdzamy: nazwę, numer wersji, rozmiar większy od zera i obecność pliku,
- identyfikator pliku Drive, czas wysłania i wynik weryfikacji zapisujemy w `RELEASE-GATE.json`,
- brak ZIP-a lub brak weryfikacji oznacza `NO-GO` dla zamknięcia wydania.

## 7. Stała kolejność pracy

`BASELINE DIAGNOSTICS -> ZMIANA -> TESTY -> RELEASE GATE -> PRE-DEPLOY DIAGNOSTICS -> FINAL ZIP -> GOOGLE DRIVE BACKUP -> DEPLOY -> PRODUCTION CHECK -> POST-DEPLOY DIAGNOSTICS -> RELEASE CLOSE GATE -> ZAMKNIĘCIE WYDANIA`

Nie deklarujemy wersji jako zakończonej przed przejściem ostatniego kroku.
