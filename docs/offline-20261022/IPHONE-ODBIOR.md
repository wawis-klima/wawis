# Odbiór na fizycznym iPhonie — WAWIS

Status początkowy: **NIEWYKONANY**. Test wykonywać osobno w Safari i osobno w aplikacji otwartej z ikony. Nie usuwać istniejącej aplikacji ani danych witryny. Nie używać prawdziwego klienta; przygotować dozwolony montaż testowy w środowisku odbiorczym. Produkcyjny zapis lub wdrożenie wymaga oddzielnego polecenia „Wdrażaj”.

Zanotuj model iPhone, iOS, Safari, tryb Safari/PWA, dokładny SHA kandydata, origin, konto testowe i godzinę. Drugi ekran administratora służy do sprawdzania serwera. Domena preview ma oddzielną pamięć: nie dowodzi odzyskania kolejki z produkcyjnego origin.

1. Otwórz montaż online, aby był dostępny lokalnie. Zanotuj jego nazwę testową i stan serwera: bez nowego JW/JZ.
2. Włącz tryb samolotowy, wyłącz również Wi‑Fi. Dodaj zdjęcie JW i JZ. Użyj dwóch różnych, czytelnych zdjęć. Jeśli OCR nie jest dostępny lokalnie, wybierz istniejącą weryfikację ręczną, wpisz i osobiście porównaj model/SN. Potwierdź wymagany przegląd numeru. Aplikacja musi pokazać metodę ręczną; nie wolno obchodzić komunikatu o niezgodnej tabliczce lub braku dowodu tabliczki.
3. Zatwierdź „Zapisz urządzenia i tabliczki”. Oczekuj „Zapisano na telefonie – oczekuje na synchronizację”, nie „zapisano na serwerze”. Protokół pozostaje nieaktywny.
4. Zamknij PWA/Safari, ponownie otwórz bez sieci. Montaż, pola i obie tabliczki muszą pozostać dostępne. Nie otwieraj aplikacji po raz pierwszy offline na nieprzygotowanym urządzeniu.
5. Włącz sieć i pozostaw aplikację aktywną. Synchronizacja powinna ruszyć automatycznie; drugi przebieg wykonaj przyciskiem „Synchronizuj teraz”. Jeśli nastąpi błąd, zachowaj raport i dane, nie resetuj pamięci.
6. Na drugim ekranie potwierdź stan backendu: dokładnie po jednym nowym photos dla JW i JZ, oba storage_path, obiekty Storage o rozmiarze >0, oba dają się pobrać i wyświetlić. Przy kontroli technicznej porównaj SHA-256 z intentem lokalnym. Potwierdź dokładny model i numer urządzenia w jobs oraz urządzenie powiązane z tym montażem; brak drugiego urządzenia z tym samym SN.
7. Dopiero teraz sprawdź aktywację „Protokół”. Zamknij i ponownie otwórz montaż; stan musi pozostać poprawny. Wyloguj/zaloguj i powtórz kontrolę. Ponów synchronizację: liczba urządzeń i zdjęć nie może wzrosnąć.
8. Przygotuj i zapisz testowy protokół oraz testowy podpis wyłącznie dla dozwolonego montażu. Sprawdź, że „Zakończ” jest dostępne dopiero po zapisanym protokole/podpisie. Nie wysyłaj testowych dokumentów do rzeczywistych klientów.

Powtórz dodatkowo:

- Sieć dostępna od początku: cały zapis bez utkwienia w kolejce.
- Wyłączenie internetu po przesłaniu pierwszego zdjęcia: powrót sieci, oba zdjęcia i jedno urządzenie bez dubli.
- Zamknięcie PWA w trakcie wysyłania: wznowienie po otwarciu, bez wymagania działania w tle.
- Wylogowanie z oczekującą kolejką; inne konto nie widzi ani nie wysyła prywatnej kolejki pierwszego. Po powrocie właściciela dane pozostają i można je ponowić.
- Odświeżenie widoku przy błędzie: pola lokalne nie znikają; komunikat rozróżnia zapis lokalny, błąd i konflikt. Protokół zablokowany.
- Zachowana kolejka v4 z 13.43–48 na tym samym origin: zgodny czytnik widzi ją, a nie przedstawia pustej listy jako sukcesu. Tego punktu nie zastępuje nowe zdjęcie w preview.

| Dowód | Safari | PWA |
|---|---|---|
| Lokalny zapis dwóch zdjęć i danych po restarcie offline | PENDING | PENDING |
| Dwa rzeczywiste pliki Storage, rozmiar i SHA/odczyt | PENDING | PENDING |
| Dwa rekordy photos, zgodne jobs i urządzenie | PENDING | PENDING |
| Protokół zablokowany przed ACK i dostępny po ACK | PENDING | PENDING |
| Brak dubli po retry/logout/restart | PENDING | PENDING |
| Stara kolejka na właściwym origin | PENDING | PENDING |

Przy jakimkolwiek niepowodzeniu: **NO-GO**. Zapisz godzinę, krok i bezpieczny raport diagnostyczny. Zachowaj dane telefonu. Nie uznawaj samego koloru komunikatu lub zielonego Playwright za zakończenie odbioru.
