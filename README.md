## Aktualna wersja
- 10.26

Wersja 10.25 usuwa z mobilnego modułu Paliwo instrukcyjny opis pod nagłówkiem „Tankowania”, dzięki czemu formularz zaczyna się wyżej i zajmuje mniej miejsca. Desktop pozostaje bez zmian.

# Wawis Klimatyzacja — wersja 10.25


## Push po tankowaniu pracownika — 10.23

- po udanym zapisie tankowania przez pracownika aplikacja wywołuje osobną funkcję `send-fuel-entry-push`,
- administrator otrzymuje push „Zatankowano samochód” z pracownikiem, samochodem, ilością paliwa i przebiegiem,
- tankowanie wpisane przez administratora nie generuje powiadomienia,
- funkcja serwerowa sprawdza aktywną sesję oraz czy wskazany wpis rzeczywiście należy do zalogowanego pracownika,
- `push_delivery_log` używa klucza `fuel_entry:<id>` do ochrony przed ponownym wysłaniem tego samego tankowania,
- błąd push nie cofa zapisanego tankowania,
- nie ma nowej migracji SQL; wdrożenia wymaga nowa Edge Function Supabase.

## Zwijane „Nowe tankowanie” na desktopie — 10.21

- na desktopie sekcja „1. Nowe tankowanie” jest domyślnie zwinięta,
- przycisk „Rozwiń” pokazuje pełny formularz, a „Zwiń” ponownie go chowa,
- wersja mobilna nadal pokazuje formularz od razu i nie otrzymuje przycisku zwijania,
- nie zmieniono logiki zapisu tankowania, przebiegu ani historii pojazdów.

## Pierwszy przebieg bez ograniczenia — 10.20

- jeżeli samochód nie ma jeszcze żadnego zapisanego przebiegu, pierwszy stan licznika jest traktowany jako wartość początkowa i nie jest porównywany z `0 km`,
- pierwszy wpis może wynosić np. 12 000 km, 100 000 km albo 125 400 km,
- od drugiego tankowania działają dotychczasowe zabezpieczenia: blokada cofnięcia przebiegu, potwierdzenie skoku powyżej 2 000 km oraz zdjęcie wymagane przy różnicy powyżej 5 000 km,
- baza danych już wcześniej pomijała kontrolę różnicy dla pierwszego wpisu; poprawka dotyczy błędnej interpretacji `null` jako `0` w interfejsie.

## Kontrola przebiegu i historia samochodów — 10.19

- przebieg niższy od ostatniego zapisanego dla danego samochodu jest blokowany,
- wzrost większy niż 2 000 km wyświetla poprzedni przebieg, nową wartość i różnicę oraz wymaga potwierdzenia,
- ręczny wzrost większy niż 5 000 km jest blokowany; taki przypadek wymaga poprawienia wartości albo zdjęcia licznika,
- ostatni przebieg jest wspólny dla całej floty, więc kontrola uwzględnia wpisy wszystkich pracowników bez ujawniania im cudzej historii,
- administrator na desktopie ma tabelę samochodów z liczbą tankowań, łączną ilością paliwa i datą ostatniego tankowania,
- kliknięcie samochodu filtruje historię do jego tankowań; tabela nie jest renderowana w wersji mobilnej.

## Ręczny przebieg albo zdjęcie licznika — 10.18

- domyślnie można wpisać przebieg ręcznie i zapisać tankowanie bez wykonywania zdjęcia,
- opcja „Zrób zdjęcie” nadal uruchamia lokalny OCR, a przy niepewnym wyniku zapasowy odczyt OpenAI,
- ręczny zapis nie wysyła pliku do magazynu zdjęć i jest oznaczony w historii jako „ręcznie”,
- z formularza usunięto zajmującą miejsce sekcję zarządzania flotą; pięć zapisanych samochodów nadal jest dostępnych na liście wyboru,
- administrator nadal widzi wszystkie tankowania i może je usuwać, a pracownik widzi tylko własne wpisy.

## Flota i prywatne tankowania pracowników — 10.17

- z mobilnego górnego menu usunięto Diagnostykę; pozostaje dostępna administratorowi na desktopie,
- wpisano flotę: dwa Doblo, Vivaro, podnośnik i Master z podanymi numerami rejestracyjnymi,
- pracownik mobilny ma dostęp do modułu Paliwo i widzi wyłącznie własne tankowania,
- administrator widzi wszystkie tankowania wraz z nazwiskiem osoby, która utworzyła wpis,
- zarządzanie flotą, ukrywanie pojazdów i usuwanie tankowań pozostają dostępne tylko administratorowi,
- prywatność wpisów i zdjęć licznika jest wymuszana przez reguły bazy, nie tylko przez wygląd aplikacji.

## Lokalny OCR z zapasowym OpenAI — 10.16

- zdjęcie licznika jest najpierw analizowane lokalnie na urządzeniu,
- lokalny wynik jest przyjmowany tylko po rozpoznaniu etykiety ODO/TOTAL i uzyskaniu zgodnych, pewnych odczytów,
- licznik TRIP oraz niepewny lub pojedynczy wynik nie są zapisywane automatycznie,
- gdy lokalny OCR nie daje pewnego wyniku albo przekroczy limit czasu, aplikacja automatycznie uruchamia odczyt OpenAI,
- ekran informuje, czy wynik pochodzi z lokalnego OCR, OpenAI czy awaryjnej korekty,
- przed zapisem nadal obowiązuje wizualne potwierdzenie zdjęcia i cyfr przez administratora.

## Zdjęcie licznika i odczyt AI — 10.15

- stan licznika jest odczytywany ze zdjęcia wykonanego bezpośrednio w formularzu tankowania,
- AI rozpoznaje wyłącznie główny licznik ODO/TOTAL i odrzuca licznik dzienny TRIP oraz nieczytelne ujęcia,
- przed zapisem administrator widzi zdjęcie, rozpoznaną wartość i pewność odczytu,
- ręczna korekta pozostaje ukrytym trybem awaryjnym i jest odnotowana jako korekta,
- zdjęcie trafia do prywatnego magazynu dostępnego wyłącznie administratorowi,
- historia tankowań pozwala otworzyć zdjęcie użyte do odczytu przebiegu.

## Testowy moduł tankowań — 10.14

- moduł jest widoczny tylko dla administratora i dodatkowo chroniony regułami bazy,
- dokładna data i godzina pochodzą z serwera,
- wpis obejmuje pojazd, ilość paliwa w litrach oraz pełny stan licznika,
- numery rejestracyjne można dodawać i czasowo ukrywać bez zmiany kodu,
- historia pokazuje 100 najnowszych wpisów i pozwala usuwać dane testowe,
- błędy zapisują w diagnostyce źródło `fuel` bez danych użytkowych.

## Czytelna diagnostyka — 10.13

- błędy i ostrzeżenia są klasyfikowane rozłącznie na podstawie typu zdarzenia,
- udane operacje nie stają się błędami tylko dlatego, że zawierają pole takie jak `failedCount: 0`,
- identyczne wpisy są grupowane i wyświetlane z liczbą powtórzeń,
- główny widok pokazuje ostatnie 24 godziny, a starsze wpisy pozostają w zwijanej historii,
- nowe zdarzenia zapisują wersję aplikacji, platformę i techniczny moduł źródłowy,
- centralna diagnostyka zachowuje zgodność ze starszą bazą do czasu wykonania migracji.

## Automatyczne odzyskiwanie miniatur — 10.12

- niedziałający link miniatury jest usuwany z pamięci podręcznej i podpisywany ponownie,
- po drugim błędzie aplikacja używa oryginalnego zdjęcia jako miniatury,
- brak miniatury nie blokuje otwarcia pełnego zdjęcia,
- błąd trafia do cichej diagnostyki jako `photo.thumbnail.load.failed`, bez danych klienta,
- użytkownik nie musi się wylogowywać ani ponownie logować.

## Odblokowany zapis protokołu — 10.11

- każdy etap zapisu i cała operacja mają jawny limit czasu,
- po błędzie lub przekroczeniu czasu ekran zawsze odzyskuje możliwość obsługi,
- zapis nie wykonuje już dodatkowego odczytu protokołu po udanym `insert` lub `update`,
- timeout trafia do cichej diagnostyki jako `protocol.save.timeout`, bez danych klienta,
- zmiana jest wyłącznie techniczna i nie zmienia wyglądu ani przebiegu prawidłowo zakończonego zapisu.

## Stabilna synchronizacja i kopie — 10.10

- zapisuje dokładny numer ostatniej obsłużonej zmiany i po przerwaniu podejmuje pracę od tego miejsca,
- okresowe zabezpieczenie Realtime pobiera wyłącznie zmienione zlecenia,
- operacje offline mają trwałe potwierdzenia, blokadę przerwanej próby i narastające odstępy ponowień,
- skompresowany plik zdjęcia pozostaje w kolejce, więc ponowienie nie wykonuje ponownie całego przygotowania,
- cicha diagnostyka wysyła administratorowi wyłącznie oczyszczone zdarzenia techniczne bez danych klientów,
- zdjęcia i protokoły trafiają do kolejki kopii przeznaczonej dla drugiego, niezależnego projektu Supabase,
- istniejący ekran i sposób pracy pracowników pozostają bez zmian.

## Większy podpis i czytelniejszy wydruk A4 — 10.09

- Tekst informacji o przetwarzaniu danych osobowych i zagospodarowaniu odpadów zwiększono z 9 pt do 9,4 pt.
- Podpis klienta jest większy, nadal zachowuje naturalne proporcje i pozostaje po lewej stronie.
- Kreska podpisu składanego na ekranie telefonu jest grubsza, dzięki czemu lepiej wychodzi na wydruku termicznym.
- Główna zawartość zaczyna się nieco wyżej i lepiej wykorzystuje wysokość A4.
- Zachowano bezpieczne marginesy boczne, wolną prawą stronę na pieczątkę i podpis instalatora oraz jedną stronę typowego protokołu.

## Finalny układ podpisów i informacji — 10.08

- Usunięto z prawego górnego rogu protokołu oznaczenie `WERSJA TESTOWA`.
- Po prawej stronie podpisu klienta dodano linię i opis `Pieczątka i podpis instalatora`.
- Nagłówki informacji o przetwarzaniu danych osobowych i zagospodarowaniu odpadów są wyśrodkowane w swoich sekcjach.
- Zachowano powiększony układ A4, czarną czcionkę, marginesy około 4,2 mm i jedną stronę dokumentu.

## Pełniejsze A4 i większa czcionka — 10.07

- Zewnętrzne marginesy sekcji zmniejszono do około 4,2 mm.
- Powiększono wszystkie teksty: nagłówek firmy, dane klienta, realizację, urządzenia, płatność, potwierdzenie i stopkę.
- Tekst informacji o danych osobowych i odpadach zwiększono do 9 pt.
- Powiększono również obszar podpisu, zachowując naturalne proporcje obrazu.
- Wykorzystano wolną wysokość strony, zachowując jedną stronę A4 i miejsce po prawej na podpis pracownika oraz pieczątkę.

## Mniejsze marginesy i większa czytelność PDF — 10.06

- Zewnętrzne marginesy sekcji PDF zmniejszono z około 11,3 mm do około 5,6 mm.
- Karty i tekst wykorzystują większą szerokość strony, bez wychodzenia poza bezpieczny obszar wydruku.
- Tekst informacji o danych osobowych i zagospodarowaniu odpadów zwiększono z 6,55 pt do 8 pt.
- Powiększono również dane klienta, realizacji, płatności, urządzeń, nagłówki i stopkę.
- Zachowano jedną stronę A4, czarną czcionkę, proporcjonalny podpis klienta po lewej oraz wolną prawą stronę na podpis pracownika i pieczątkę.

## Podpis bez rozciągania — 10.05

1. Po zatwierdzeniu podpisu aplikacja automatycznie usuwa nadmiar białego pola wokół kreski podpisu.
2. Podpis jest wstawiany do PDF z zachowaniem naturalnych proporcji obrazu.
3. Dostępne pole podpisu jest wyższe, a podpis jest wyśrodkowany nad własną linią.
4. Podpis klienta pozostaje po lewej stronie, a prawa strona nadal jest wolna na podpis pracownika i pieczątkę.

## Czarna czcionka protokołu — 10.04

1. Wszystkie etykiety pól, w tym `Data montażu`, `Monterzy`, `Zakończono`, `Status` i `Zakończył`, są drukowane czarną czcionką.
2. Nagłówki tabel, status tabliczki, dane płatności, tekst RODO, ustalenia dotyczące odpadów, potwierdzenie klienta i stopka również są czarne.
3. Układ protokołu, podpis klienta po lewej oraz wolne miejsce na podpis pracownika i pieczątkę pozostają bez zmian.

## Podpis klienta po lewej stronie — 10.03

1. Podpis klienta jest wyrównany do lewej i znajduje się bezpośrednio nad opisem podpisu składanego na ekranie telefonu.
2. Linia pod podpisem obejmuje tylko lewą część sekcji.
3. Prawa połowa pozostaje pusta na ręczny podpis pracownika i pieczątkę.
4. Powtórzoną datę spod podpisu usunięto; data podpisania nadal znajduje się w nagłówku protokołu.

## Druk protokołu przez Phomemo M832 — 10.02

1. Zapisany protokół nadal pozostaje właściwym dokumentem PDF w systemie WAWIS.
2. Po naciśnięciu `Drukuj protokół` PDF jest renderowany w pamięci telefonu jako obraz PNG przeznaczony tylko do drukowania.
3. Do menu iPhone'a przekazywany jest wyłącznie ten obraz, dzięki czemu Phomemo jest dostępne dla modelu M832.
4. Obraz obejmuje wszystkie strony protokołu i łączy je pionowo pod wydruk na rolce.
5. Obraz nie trafia do aplikacji `Zdjęcia`, `Pliki` ani `Pobrane`.

## Bezpośrednie przekazanie PDF do Phomemo — 10.01

1. Przycisk `Drukuj protokół` przekazuje do menu udostępniania iPhone'a wyłącznie plik PDF.
2. Usunięto dodatkowy tytuł i tekst, które aplikacja Phomemo mogła interpretować jako funkcję nieobsługiwaną przez M832.
3. Protokół nie jest zapisywany w aplikacji `Pliki` ani w katalogu `Pobrane`.
4. Jeśli iPhone nie obsługuje udostępnienia pliku PDF, aplikacja pokazuje błąd zamiast pobierać dokument.

## Centrum 360 i przejście do kontrahenta — 10.00

1. W Centrum 360 usunięto powielone małe pole `Szukaj… Ctrl K` oraz przycisk `Dzisiaj` po prawej stronie nagłówka.
2. Główne wyszukiwanie klienta, telefonu, adresu, modelu i numeru seryjnego u góry aplikacji pozostaje bez zmian.
3. Kliknięcie wyniku oznaczonego jako `Kontrahent` otwiera moduł `Kontrahenci` w widoku listy.
4. Właściwy klient jest automatycznie zaznaczony, a jego panel szczegółów otwiera się po prawej stronie.

## Jednowierszowy wykonawca i paginacja — 9.99

1. Mobilny wiersz zakończenia pokazuje samo imię i nazwisko wykonawcy, bez prefiksu `Przez:`.
2. Nazwisko wykonawcy nie zawija się do drugiej linii.
3. Przyciski paginacji mają 28 px szerokości, a wielokropek 9 px.
4. Układ `‹ 1 2 3 … 12 ›` jest wymuszony w jednym rzędzie i dołączony bezpośrednio do komponentu, aby nie zależał od starszego CSS w pamięci telefonu.

## Zwijane urządzenia i poprawiony wiersz zakończenia — 9.98

1. Etykieta `ZAKOŃCZONO` ma szerszą kolumnę i rzeczywisty odstęp od daty.
2. Data zakończenia oraz `Przez: [pracownik]` są wyśrodkowane w prawej części wiersza.
3. Każda karta `Urządzenie 1`, `Urządzenie 2` itd. jest po wejściu w zlecenie domyślnie zwinięta.
4. Kliknięcie nagłówka rozwija lub zwija wyłącznie wybrane urządzenie.
5. Wymaganie kompletu zdjęć tabliczek i blokada zakończenia zlecenia działają również przy zwiniętych kartach.

## Uporządkowany protokół powykonawczy — 9.97

1. Nazwa `WAWIS CHŁODNICTWO I KLIMATYZACJA` i `Piotr Wasik` są w jednym wierszu nagłówka.
2. Adres i NIP są w jednym wierszu, a telefon, e-mail i strona WWW w kolejnym wspólnym wierszu.
3. REGON został usunięty z protokołu.
4. Karty danych zlecenia, realizacji i płatności mają mniejsze, wyrównane odstępy pionowe.
5. Czcionka informacji o danych osobowych i ustalenia dotyczącego odpadów jest większa, a typowy protokół nadal mieści się na jednej stronie A4.

## Zapisany protokół na desktopie — 9.96

1. Administrator widzi sekcję `Protokół klienta` w szczegółach zakończonego zlecenia.
2. Zapisany PDF można otworzyć w pełnoekranowym podglądzie bez generowania nowej kopii.
3. Przycisk `Drukuj` otwiera standardowe okno drukowania przeglądarki.
4. Przycisk `Wyślij klientowi` korzysta z dotychczasowej zabezpieczonej wysyłki z `biuro@wawis.pl` na adres zapisany w zleceniu.
5. Jeśli protokół nie istnieje, desktop pokazuje czytelną informację zamiast przycisków bez działania.
6. Nie dodano zmian bazy — desktop korzysta z istniejących tabel `job_protocols` i `job_protocol_email_log` oraz prywatnego pliku PDF.

## Wymuszony układ mobilny paginacji i zakończenia — 9.95

1. Aktywne przyciski paginacji mają 30 px szerokości i 32 px wysokości.
2. Cały zestaw strzałek, numerów oraz wielokropka jest wymuszony w jednym rzędzie bez zawijania.
3. Etykieta `Zakończono` ma 14 px odstępu od prawej kolumny z datą.
4. Data zakończenia i informacja `Przez:` są wyśrodkowane w prawej kolumnie.

## Mobilna paginacja i daty szczegółów — 9.94

1. Przyciski paginacji są mniejsze i zawsze pozostają w jednym rzędzie na telefonie.
2. Mobilny zakres stron pokazuje maksymalnie trzy kolejne numery, z pierwszą i ostatnią stroną dostępną przez skróty.
3. Data montażu oraz data i godzina zakończenia są wyrównane do prawej strony karty szczegółów.
4. Informacja `Przez:` ma osobną linię i nie nachodzi na etykietę `Zakończono`.

## Pole daty zapłaty wewnątrz karty — 9.93

1. Ramka pola `Data zapłaty` nie wychodzi już poza prawą krawędź wewnętrznej karty płatności.
2. Pole może się zwęzić do szerokości ekranu i uwzględnia własny padding w całkowitej szerokości.
3. Rozmiar tekstu nadal wynosi 16 px, więc Safari nie powinno automatycznie przybliżać formularza.
4. Pozostały układ protokołu i wynikowy PDF nie zostały zmienione.

## Informacje prawne w protokole PDF — 9.92

1. Z PDF usunięto sekcję `Dokumentacja zapisana w aplikacji` oraz zdanie o niezastępowaniu faktury lub paragonu.
2. Dodano krótką informację o przetwarzaniu danych zgodną ze strukturą art. 13 RODO, bez błędnego przedstawiania obsługi zlecenia jako zgody klienta.
3. Dodano ustalenie, że w zakresie dopuszczalnym przez przepisy wytwórcą odpadów jest Zleceniodawca, chyba że strony odrębnie uzgodnią ich odbiór.
4. Układ pozostaje jednostronicowy dla typowego zlecenia i jest bardziej zwarty w pionie, bez zmniejszania podstawowych danych zlecenia.

## Brak automatycznego przybliżania pól — 9.91

1. Pola płatności mają na iPhonie minimalny rozmiar tekstu 16 px wymagany przez Safari do zachowania bieżącej skali.
2. Dotknięcie kwoty nie powinno już przybliżać całego formularza ani rozciągać jego układu po zamknięciu klawiatury.
3. Ręczne powiększanie pozostaje dostępne, a działanie płatności i protokołu nie zostało zmienione.

## Prosta sekcja podpisu klienta — 9.90

1. Usunięto z formularza uwagę o fakturze, paragonie i innym dokumencie księgowym.
2. Pod nagłówkiem `Potwierdzenie klienta` nie ma już opisu zakończenia montażu ani płatności.
3. Przed podpisaniem nie są wyświetlane teksty `Brak podpisu klienta` ani opis ekranu podpisu — zostaje sam przycisk `Podpis klienta`.
4. Po zatwierdzeniu podpisu nadal pojawia się jego status, a wszystkie funkcje protokołu działają bez zmian.

## Czytelne uzupełnianie protokołu — 9.89

1. Zapisany protokół bez potwierdzenia zapłaty nie pokazuje pustego nagłówka `Potwierdzenie zapłaty`.
2. Sekcja płatności jest widoczna podczas uzupełniania albo po zapisaniu rzeczywistej płatności.
3. Przycisk `Zmień protokół` został zastąpiony przyciskiem `Uzupełnij protokół` prowadzącym do płatności i podpisu klienta.
4. Nie zmieniono działania PDF, podpisu, płatności, druku ani firmowej wysyłki.

## Uproszczony formularz protokołu — 9.88

1. Sekcja `Potwierdzenie zapłaty` pokazuje nagłówek, przełącznik `Dodaj` i — po włączeniu — właściwe pola płatności.
2. Usunięto opis opcjonalnego dodawania do PDF oraz komunikat, że płatność nie zostanie dodana.
3. Usunięto powtarzane informacje o konieczności ponownego podpisu po zmianie danych.
4. Zapis, podpis klienta, płatność, PDF, druk Phomemo oraz firmowa wysyłka z `biuro@wawis.pl` działają jak wcześniej.

## Firmowa wysyłka protokołu — 9.87

1. Przed wdrożeniem wykonaj konfigurację opisaną w `SUPABASE-EDGE-DEPLOY-v9.87.md`.
2. Telefon pracownika nie otwiera Outlooka, Mail ani prywatnej skrzynki. Przycisk `Wyślij z biuro@wawis.pl` wywołuje zabezpieczoną Edge Function.
3. Serwer sprawdza zalogowanego użytkownika, jego dostęp do zlecenia, status `Zakończone`, zapisany protokół oraz zgodność odbiorcy z adresem klienta w zleceniu.
4. Prywatny PDF jest pobierany przez serwer i dołączany do wiadomości wysyłanej jako `WAWIS Klimatyzacja <biuro@wawis.pl>`.
5. Każda próba zapisuje odbiorcę, nadawcę, pracownika, czas, status oraz identyfikator dostawcy w `job_protocol_email_log`.
6. Wysyłka korzysta z Resend. Klucz API pozostaje wyłącznie w sekretach Supabase, a domena `wawis.pl` musi być zweryfikowana u dostawcy.
7. Menu systemowe telefonu jest używane tylko do drukowania w Phomemo; zapis PDF pozostaje osobną akcją.

## Płatność i druk Phomemo — 9.86

1. Jeżeli protokoły z wersji 9.79 nie były jeszcze uruchamiane, najpierw wykonaj w Supabase SQL Editor plik `supabase/setup-job-protocols-v9.79.sql`.
2. Przed wdrożeniem wersji 9.86 wykonaj w Supabase SQL Editor cały plik `supabase/setup-job-payment-confirmation-v9.86.sql`.
3. Na zakończonym zleceniu pozostaje tylko jeden zewnętrzny przycisk `Protokół`.
4. W protokole można opcjonalnie włączyć potwierdzenie zapłaty i podać kwotę, rodzaj wpłaty, metodę oraz datę. Dane zostają zapisane przy zleceniu.
5. Zmiana danych płatności po zapisaniu dokumentu wymaga ponownego podpisu klienta, aby podpis zawsze dotyczył aktualnej treści.
6. Po zapisaniu przycisk `Drukuj lub wyślij` pokazuje trzy działania: druk w Phomemo, wysłanie e-mailem i zapis PDF w telefonie.
7. `Drukuj w Phomemo` przekazuje gotowy PDF do systemowego menu telefonu; na iPhonie należy wybrać aplikację Phomemo i drukarkę M832.
8. PDF ma jasny, oszczędny układ odpowiedni dla drukarki termicznej, okrągły znak `W`, pełne dane firmy oraz opcjonalne potwierdzenie zapłaty.

## Firmowy nagłówek protokołu PDF — 9.85

- Protokół korzysta z oryginalnego logo WAWIS zapisanego w aplikacji.
- Nagłówek zawiera nazwę WAWIS Chłodnictwo i Klimatyzacja, Piotra Wasika, adres, telefon, e-mail, NIP oraz REGON.
- Usunięto ogólny napis `Potwierdzenie zakończenia montażu`; miejsce wykorzystano na właściwe dane firmy.
- Dokument pozostaje jednostronicowy i zachowuje dane zlecenia, urządzenia, zdjęcia tabliczek oraz podpis klienta.

## Czytelny protokół i osobny podpis — 9.84

- Dane zlecenia są pokazane w równych wierszach etykieta–wartość, a każde urządzenie ma osobną kartę czytelną na telefonie.
- Rozmiary tekstu i odstępy są kontrolowane również na iPhonie, więc sekcje nie nakładają się i nie tworzą przypadkowo powiększonych napisów.
- Przycisk `Podpis klienta` otwiera osobny ekran zajmujący cały telefon; ekran nie przewija się podczas rysowania palcem.
- Klient zatwierdza podpis osobnym przyciskiem. Po powrocie można zapisać PDF albo ponownie otworzyć ekran i zmienić podpis.

## Protokół w obudowie kreatora urządzenia — 9.83

- Protokół korzysta z identycznej pełnoekranowej obudowy jak mobilne „Dodaj urządzenie”: ten sam overlay, biała karta, nagłówek, przewijany środek i przyciski na dole.
- Cała zawartość protokołu znajduje się w jednym głównym elemencie, dlatego ogólna klasa `.modal` nie może już rozrzucić sekcji obok siebie.
- Zachowano dane zlecenia, urządzenia i tabliczki, podpis klienta, zapis PDF, późniejsze pobranie oraz wysłanie e-mailem.
- Test wydania porównuje obudowę protokołu z obudową działającego kreatora urządzenia i sprawdza wynikowe pliki CSS oraz JavaScript.

## Izolacja protokołu i pewna aktualizacja aplikacji — 9.82

- Okno protokołu nie używa już ogólnej klasy `.modal`, która służyła również do podglądu zdjęć i powodowała nakładanie się danych na iPhonie.
- Protokół ma własną klasę układu, białe tło, pionowy przepływ treści, przewijanie i pole podpisu o stałej wysokości 170 px.
- W nagłówku protokołu widoczny jest faktycznie uruchomiony numer wersji, dzięki czemu od razu wiadomo, czy telefon załadował nowe pliki.
- Aplikacja sprawdza aktualizację Service Workera i przeładowuje się po przejęciu przez nową wersję, zamiast pozostawać na starej sesji.
- Test wizualny wydania otwiera teraz sam protokół i sprawdza jego położenie, białe tło, pionowy układ oraz brak wyjścia poza ekran iPhone'a.
- Kontrola gotowego katalogu `dist` blokuje wydanie, jeżeli skompilowany JavaScript ponownie połączy protokół z klasą `.modal` albo zabraknie izolowanych stylów.

## Naprawa ekranu protokołu na iPhonie — 9.81

- Protokół ma własny układ odporny na stare globalne style podglądu zdjęć, które wcześniej ustawiały jego zawartość obok siebie i powodowały nakładanie tekstu.
- Okno ma białe tło, normalny pionowy układ, poprawne rozmiary tekstu i niezależne przewijanie.
- Pole podpisu klienta zachowuje wysokość 170 px i pełną szerokość okna.
- Uwzględniono bezpieczne marginesy ekranu iPhone'a oraz blokadę automatycznego powiększania tekstu przez Safari.
- Zmiana nie ingeruje w podgląd zdjęć, dane protokołu, generowanie PDF ani zapis dokumentu.

## Domyślna data nowego montażu — 9.80

- Po otwarciu mobilnego formularza `Dodaj nowego klienta` pole `Data montażu` zawiera dzisiejszą datę według lokalnego czasu telefonu.
- Domyślna data jest ustawiana przy każdym nowym otwarciu formularza, więc pozostaje poprawna także po zmianie dnia bez wylogowywania z aplikacji.
- Pracownik i administrator nadal mogą ręcznie wybrać inną datę albo użyć `Wyczyść datę`.
- Edycja istniejącego montażu nie nadpisuje zapisanej wcześniej daty.
- Zmiana nie wymaga migracji bazy danych i nie zmienia wyglądu pozostałych ekranów.

## Protokół zakończonego zlecenia — 9.79

1. Przed wdrożeniem aplikacji uruchom w Supabase SQL Editor cały plik `supabase/setup-job-protocols-v9.79.sql`.
2. Pracownik kończy zlecenie dokładnie jak dotychczas; aplikacja najpierw sprawdza komplet tabliczek i zapisuje status `Zakończone`.
3. Dopiero na zakończonej karcie pojawia się opcjonalny przycisk `Utwórz protokół`, dostępny na telefonie pracownika i administratora.
4. Klient podpisuje się palcem, a PDF zostaje zapisany w prywatnym Storage i powiązany ze zleceniem.
5. Po zapisaniu dostępne są przyciski `Pobierz protokół` oraz `Wyślij e-mailem`; na iPhonie należy wybrać aplikację Mail w systemowym menu udostępniania.
6. Jeśli przeglądarka nie obsługuje przekazania PDF, aplikacja otwiera wiadomość na adres klienta z bezpiecznym linkiem aktywnym przez 7 dni.
7. Protokół nadal jest testowy i nieobowiązkowy. Nie zmienia statusu, nie blokuje zakończenia i nie zawiera numerów seryjnych.


## Szybki start z bezpiecznym odświeżaniem — 9.39
- po rozpoznaniu bieżącej sesji aplikacja od razu pokazuje ostatnią lokalną kopię profilu i listy montaży dla tego konkretnego konta,
- równolegle rozpoczyna normalny odczyt aktualnych danych z Supabase i automatycznie podmienia ekran po otrzymaniu odpowiedzi,
- podczas synchronizacji widoczny jest dyskretny status `Odświeżanie`, bez blokowania listy i nawigacji,
- każda odpowiedź serwera otrzymuje kolejny numer; spóźniona, starsza odpowiedź nie może nadpisać nowszego stanu,
- lokalny snapshot przechowuje numer wersji serwerowego odczytu i odrzuca próbę zapisania starszej kopii,
- cache desktopowy nie przechowuje zdjęć ani komentarzy szczegółowych; są one nadal pobierane normalnie po otwarciu karty montażu,
- wszystkie zapisy nadal trafiają do Supabase dotychczasową ścieżką i podlegają dotychczasowej weryfikacji,
- brak zmian w logowaniu, tabelach, RLS, uprawnieniach, Storage, zdjęciach i Edge Functions.


## Mobilny tryb offline — 9.38
- ostatnio pobrane karty montaży są zapisywane lokalnie dla konkretnego konta pracownika i wracają także wtedy, gdy Supabase jest chwilowo niedostępny,
- komentarze, dane modeli i numerów seryjnych oraz żądanie zakończenia montażu można zapisać bez internetu; istniejąca kolejka obejmuje zdjęcia montażu i tabliczek,
- po odzyskaniu połączenia aplikacja najpierw wysyła zdjęcia, następnie dane urządzeń i komentarze, a zakończenie dopiero po potwierdzeniu kompletu tabliczek na serwerze,
- pasek w nagłówku i Centrum synchronizacji pokazują wszystkie elementy zapisane na telefonie, błędy, próby oraz konflikty,
- przed zapisem statusu lub urządzenia aplikacja porównuje stan bazowy; zmiana administratora zatrzymuje lokalną operację zamiast ją nadpisać,
- akcja `Zachowaj dane z systemu` pozwala bezpiecznie odrzucić zmianę pozostającą w konflikcie,
- service worker od powiadomień przechowuje także ekran aplikacji i użyte pliki statyczne, dzięki czemu wcześniej uruchomiona aplikacja startuje bez sieci,
- tworzenie nowego klienta nadal wymaga internetu, ponieważ równolegle tworzy/powiązuje kontrahenta i nie może ryzykować duplikatów,
- wylogowanie usuwa lokalną kopię kart klienta; niewysłane kolejki pozostają przypisane do właściwego konta,
- zmiana nie wymaga migracji SQL, nowych tabel Supabase ani wdrożenia Edge Function.


## Push po komentarzu pracownika — 9.37
- po zapisaniu komentarza przez pracownika aplikacja wywołuje zabezpieczoną funkcję `send-assignment-push` z identyfikatorem komentarza i montażu,
- funkcja serwerowa ponownie sprawdza autora komentarza, powiązanie komentarza z montażem oraz dostęp pracownika do zlecenia,
- odbiorcami są wszystkie profile z rolą `Administrator`, które mają aktywną subskrypcję push,
- powiadomienie pokazuje autora, montaż i adres, ale nie ujawnia treści komentarza na ekranie blokady; kliknięcie otwiera właściwą kartę montażu,
- komentarze dodane przez administratora nie wysyłają push, a ten sam komentarz nie jest dostarczany drugi raz temu samemu administratorowi,
- błąd lub brak subskrypcji push nie cofa komentarza ani powiadomienia widocznego wewnątrz aplikacji,
- zmiana nie wymaga migracji SQL, ale wymaga ponownego wdrożenia Edge Function `send-assignment-push` z katalogu tej wersji.


## Oddzielne galerie zdjęć i tabliczek — 9.36
- miniatury `Zdjęcia montażu` nadal wykluczają tabliczki znamionowe,
- po otwarciu zwykłego zdjęcia strzałki w lewo i prawo korzystają wyłącznie z listy zwykłych zdjęć montażu,
- po otwarciu tabliczki przy JZ/JW strzałki pozostają wyłącznie w galerii tabliczek,
- aktywna galeria jest zapamiętywana przez podgląd i zerowana po przejściu do innego zlecenia,
- obsłużono adresy `image_url`, `signed_url`, `original_image_url` i lokalne podglądy,
- poprawka działa na desktopie i mobile; nie wymaga SQL ani zmian w Supabase.


## Wąski kreator urządzeń premium — 9.35
- desktopowy modal ma maksymalnie 540 px szerokości i 18 px promienia, dzięki czemu jest zwarty i proporcjonalny,
- wewnętrzny kreator ma wymuszoną szerokość 100%, co usuwa szerokie puste pasy po bokach,
- nagłówek ma kompaktowe przyciski cofnięcia i zamknięcia, a krok jest małą neutralną etykietą,
- karta urządzenia ma 78 px, akcja dodania 40 px, a odstępy boczne tylko 18 px,
- główna akcja jest grafitowa i spokojna wizualnie; nie używa jaskrawego niebieskiego,
- zmiana nadal dotyczy wyłącznie desktopowego modalu administratora; mobile i Supabase pozostają bez zmian.


## Kompaktowe okno urządzeń administratora — 9.34
- desktopowe okno `Urządzenia` nie ma już stałej wysokości 760 px; przy małej liczbie urządzeń dopasowuje się do treści,
- nagłówek i stopka są wyraźnie oddzielone, obszar roboczy ma lekkie szare tło, a każde urządzenie jest czytelną białą kartą,
- karta urządzenia jest niższa, ma uporządkowane oznaczenie Single/Multi oraz czytelny status kompletności tabliczek,
- `Dodaj kolejne urządzenie` jest zwykłym kompaktowym przyciskiem, a główna akcja na desktopie nazywa się `Zapisz urządzenia`,
- zmiana jest ograniczona do desktopowego modalu administratora; mobilny kreator zachowuje swój układ,
- brak nowego SQL i zmian po stronie Supabase.


## Przeciążenie Supabase bez fałszywego wylogowania — 9.33
- statusy `500`, `502`, `503`, `504`, timeouty i typowe błędy połączenia mają jeden czytelny komunikat: `Serwer chwilowo przeciążony — spróbuj ponownie`,
- przejściowa awaria nie jest opisywana jako błąd autoryzacji i nie usuwa bieżącego użytkownika z aplikacji,
- przywracanie danych po awarii jest automatycznie ponawiane co 5 sekund,
- aplikacja czyści sesję dopiero po rzeczywistym zdarzeniu `SIGNED_OUT`; prawdziwe `401/403`, RLS i wygaśnięty JWT nadal są obsługiwane jako błędy uprawnień,
- przypisanie montera pozostaje zapisane nawet wtedy, gdy osobna wysyłka powiadomienia push chwilowo zwróci błąd,
- zmiana nie wymaga SQL ani zmian w RLS, Storage i Edge Functions.


## Pełne lokalne dopasowanie modeli Rotenso — 9.32
- `Odczytaj kody` porównuje rozpoznany nadruk z pełnym wbudowanym katalogiem 214 pozycji EAN i 213 unikalnych kodów modeli Rotenso,
- dopasowanie toleruje typowe pomyłki lokalnego odczytu, ale wynik przyjmuje wyłącznie wtedy, gdy prowadzi do potwierdzonej pozycji katalogowej,
- `ES50Xi R17`, `ESSOXi R17`, `ES5OXi R17` i wariant z dodatkowymi odstępami prowadzą do `Rotenso / Elis Silver / 5,0 kW / JW / EAN 5905567614293`,
- poprawiono także profil obrazu dla kodów umieszczonych w górnej lewej części etykiety,
- numer seryjny nadal pochodzi wyłącznie z prawdziwego kodu Code 128/39; funkcja nie uruchamia OpenAI,
- brak nowego SQL i brak zmian Edge Functions, Storage oraz RLS.


## Urządzenia i tabliczki administratora — 9.29
- desktop: w szczegółach montażu, w sekcji `Urządzenia`, administrator ma przycisk `Dodaj / edytuj urządzenia i tabliczki`,
- desktop: przycisk otwiera ten sam kreator Single/Multi co na mobile, z wyborem marki, modelu, mocy, liczby JW oraz zdjęciami tabliczek JZ/JW,
- desktop: zapis urządzeń aktualizuje wyłącznie pola urządzeń danego zlecenia, a nowe zdjęcia tabliczek trafiają do prywatnego `job-photos/.../nameplates/`,
- desktop: istniejące zdjęcia tabliczek są rozpoznawane i pokazywane w kreatorze, więc można dopisywać brakujące urządzenia bez utraty wcześniejszych tabliczek,
- mobile administratora: w karcie montażu pojawia się przycisk `Urządzenia`, który otwiera dotychczasowy mobilny kreator używany przez pracowników,
- pracownik: dotychczasowy przycisk `Tabliczki` i jego workflow pozostają bez zmian,
- brak nowego SQL i brak zmian Edge Functions.

## Automatyczne prostowanie kodów kreskowych — 9.28
- `Odczytaj kody` najpierw zachowuje dotychczasową szybką ścieżkę dla oryginalnego kadru,
- dopiero gdy brakuje EAN lub numeru seryjnego, uruchamia automatyczny sweep kątów: -18°, -15°, -12°, -9°, -6°, -3°, +3°, +6°, +9°, +12°, +15°, +18°,
- każdy kąt jest sprawdzany w wersji zwykłej i kontrastowej, z białym tłem po obrocie,
- retry obejmuje uniwersalny lokalny dekoder, natywny BarcodeDetector (jeśli przeglądarka go udostępnia) oraz lokalny dekoder EAN-13,
- ścieżka nadal jest w 100% lokalna i nie uruchamia AI ani OCR; AI pozostaje wyłącznie ręczną opcją awaryjną.

## Głosowy komentarz administratora na desktopie — 9.25
- przy polu `Komentarz administratora` w desktopowym formularzu zlecenia dodano mikrofon po prawej stronie,
- kliknięcie mikrofonu otwiera kontrolowane okno `Nagrywanie komentarza`,
- nagrywanie kończy się jawnie przyciskiem `Zakończ nagrywanie`, a rozpoznany tekst trafia bezpośrednio do `admin_note`,
- na komputerze natywne dyktowanie jest wspierane w Chrome/Edge; przy nieobsługiwanej przeglądarce aplikacja pokazuje czytelny komunikat,
- zmiana nie przebudowuje mobilnego formularza i nie wymaga SQL/Supabase.

## Niezależne przewijanie Montaży na desktopie — 9.24
- po otwarciu szczegółów lewa lista zleceń i prawy panel szczegółów przewijają się niezależnie,
- pionowe kółko myszy nad tabelą jest kierowane bezpośrednio do lewego panelu listy,
- wysokość split-view jest ograniczona do aktualnego viewportu, dzięki czemu lista nie kończy się pod dolną krawędzią ekranu,
- zmiana dotyczy tylko desktopowego modułu `Montaże`; mobile pozostaje bez zmian.

## Kompaktowy formularz bez przełączników SMS — 9.23
- `Zgoda na SMS` i `Aktywne przypomnienia` nie są już pokazywane w formularzu,
- `sms_consent` i `sms_reminder_enabled` są zapisywane jako `true` przy tworzeniu i edycji,
- usunięto stały opis `Mów naturalnie, bez komend i bez podawania nazw pól`; samo dyktowanie działa bez zmian.

## Faktyczna naprawa mobilnego formularza — 9.22
- komentarz administratora korzysta teraz bezpośrednio z tego samego `voiceFieldRow`, który działa przy `Miejscowość` i `Ulica i numer`,
- mikrofon komentarza jest drugą, stałą kolumną 44 px po prawej stronie pola,
- przy pustym komentarzu nie pokazuje się `Wyczyść komentarz`; przy pustej dacie nie pokazuje się `Wyczyść datę`,
- `Data montażu` ma własny `installationDateInputShell` z widocznym zaokrągleniem i kontrolą overflow; natywny input daty nie używa już ogólnej klasy `.input`,
- układ krytycznych elementów jest zapisany również bezpośrednio w JSX, więc starsze reguły mobile nie mogą ponownie zrzucić mikrofonu pod pole.

## Mobilny klient pracownika, głosowy komentarz i Diagnostyka pod D — 9.19
- administrator: Diagnostyka nie zajmuje już miejsca na pierwszym ekranie; otwiera się z przycisku `D` obok przeładowania,
- administrator: pole `Komentarz administratora` ma mikrofon do natywnego dyktowania,
- pracownik: przycisk `+` otwiera formularz dodania nowego klienta/zlecenia,
- wpis utworzony przez pracownika zawsze startuje jako `Nowe`, ma pustego głównego montera i dopiero administrator wybiera głównego montera,
- twórca-pracownik otrzymuje wyłącznie dostęp do utworzonego zlecenia przez `job_access`, bez automatycznego przypisania jako główny monter,
- kontrahent jest tworzony/dopasowywany przez ograniczoną funkcję Supabase `worker_create_or_get_contractor_for_job`; pracownik nie otrzymuje dostępu do katalogu kontrahentów ani prywatnych danych istniejących klientów.

## Mobilna diagnostyka i bezpieczne przejęcie subskrypcji push — 9.18

- administrator na mobile ma jawny panel `Diagnostyka` pod sekcją Push, z przyciskami `Wyślij test push na ten telefon` i `Pobierz raport diagnostyczny`,
- usunięto ikonę diagnostyki z górnego rzędu administratora; nagłówek ma dzięki temu tylko `Dodaj` i `Przeładuj`,
- zapis/odświeżanie subskrypcji mobilnej nie wykonuje już bezpośredniego UPSERT-u do `push_subscriptions`, który przy zmianie konta na tym samym iPhonie mógł zostać zablokowany przez RLS,
- synchronizacja endpointu odbywa się przez uwierzytelnioną Edge Function `send-assignment-push`, która sama ustala użytkownika z sesji,
- przy zmianie właściciela endpointu backend wymaga zgodności obu kluczy subskrypcji (`p256dh` i `auth`), więc inny użytkownik nie może przejąć obcego endpointu tylko po jego adresie,
- RLS tabeli `push_subscriptions` pozostaje włączone i restrykcyjne dla bezpośrednich zapisów klienta,
- wyłączanie push również przechodzi przez backend i weryfikuje klucze bieżącej subskrypcji,
- zachowano test push konkretnego iPhone'a oraz retry zakończenia zlecenia z 9.17,
- brak wymaganej migracji SQL do wykonania przez użytkownika; wymaga wdrożenia aplikacji 9.18, Edge Function została zaktualizowana.

## Diagnostyka i niezawodność push — 9.17

- status `Push aktywne` wymaga teraz nie tylko lokalnej subskrypcji, ale również aktywnego wpisu bieżącego endpointu w `push_subscriptions`,
- przy wejściu do aplikacji oraz po powrocie z tła/focusie endpoint, klucze i `last_seen_at` są automatycznie synchronizowane z Supabase,
- desktopowa Diagnostyka administratora ma przycisk `Wyślij testowe powiadomienie push`, który testuje aktywne urządzenia administratora bez zmiany statusu zlecenia,
- Edge Function `send-assignment-push` obsługuje zdarzenie `push_test`, tylko dla administratora, i zapisuje wynik do `push_delivery_log`,
- obsługa `job_completed` ponawia po stronie serwera odczyt statusu `Zakończone`, a klient ponawia wyłącznie odpowiedź 409 w kontrolowanych odstępach.

## Nowy montaż mobile bez urządzeń — 9.16

- przy tworzeniu nowego montażu z `+` nie jest renderowana sekcja `Urządzenia w montażu`,
- nie pokazujemy wtedy typu single/multi, modeli, numerów seryjnych ani zdjęć tabliczek znamionowych,
- zapis nowego zlecenia działa bez urządzenia; pola `device_model` i `device_serial_number` pozostają puste,
- po utworzeniu zlecenia urządzenia nadal można dodać podczas edycji istniejącego montażu,
- osobny mobilny kreator urządzeń/tabliczek pozostaje dostępny i nie został uproszczony,
- wymaganie tabliczek JW/JZ przy zakończeniu montażu pozostaje bez zmian,
- desktop nie został zmieniony,
- brak nowej migracji SQL,
- test regresyjny: `npm run test:smoke:mobile-new-job-no-devices`.

## Mobilny panel administratora — 9.15

- górne menu `Montaże / Kontrahenci / Urządzenia / SMS` korzysta z czterech równych kolumn i nie może nachodzić na siebie przy szerokości iPhone'a,
- dodano obsługę `safe-area-inset-*` oraz `viewport-fit=cover`, aby menu nie wchodziło pod zegar, Dynamic Island ani ikony systemowe iOS,
- blok `WERSJA 9.15` oraz trzy akcje administratora (`Dodaj`, `Przeładuj`, `Diagnostyka`) są utrzymywane w jednym równym wierszu bez zawijania,
- usunięto osobną ikonę wylogowania administratora; kliknięcie pola z nazwą zalogowanego administratora wykonuje wylogowanie,
- pracownik zachowuje dotychczasową ikonę wylogowania, ponieważ kliknięcie jego nazwy nadal służy do przełączania listy przypisanych zleceń,
- przycisk odświeżania nie wywołuje już tylko `refreshAll()`: wykonuje `window.location.reload()`, czyli realnie przeładowuje aplikację i aktualne zasoby z Vercela,
- dodano blokadę automatycznego powiększania tekstu przez Safari w tym układzie, aby iOS nie rozsuwał etykiet menu,
- brak nowej migracji SQL i brak zmian w danych Supabase,
- test regresyjny: `npm run test:smoke:mobile-admin-header`.

## Data/godzina zakończenia + push do administratora — 9.14

- tabela `jobs` otrzymuje pola `completed_at` i `completed_by`, ustawiane automatycznie przez trigger dokładnie przy przejściu do statusu `Zakończone`,
- po ponownym otwarciu zlecenia metadane zakończenia są czyszczone; kolejne zakończenie zapisuje nową datę i godzinę,
- administrator w szczegółach montażu na desktopie i telefonie widzi **Zakończono: data + godzina** oraz, jeśli dostępne, użytkownika który zakończył zlecenie,
- stare zakończone zlecenia pozostają bez sztucznie wymyślonej godziny — interfejs informuje, że dokładna chwila nie była zapisywana przed 9.14,
- istniejąca Edge Function `send-assignment-push` obsługuje teraz również zdarzenie `job_completed`; po zakończeniu zlecenia wysyła push do aktywnych subskrypcji profili Administrator,
- pracownik może wywołać push zakończenia wyłącznie dla zlecenia, do którego ma dostęp; Edge Function ponownie sprawdza po stronie serwera, czy status w bazie rzeczywiście jest `Zakończone`,
- push nie blokuje zapisu zakończenia: jeżeli dostarczenie powiadomienia się nie uda, zlecenie pozostaje poprawnie zakończone,
- przed wdrożeniem uruchom `job-completion-tracking-v9.14.sql` w Supabase SQL Editor i ponownie wdróż Edge Function `send-assignment-push`.
- test regresyjny: `npm run test:smoke:job-completion`.

## Status tabliczek i ręczne potwierdzanie — 9.13

- na desktopowej liście **Montaże** dodano kolumnę **Tabliczki** pomiędzy monterem a datą montażu,
- zielony status **Potwierdzone** oznacza, że każda oczekiwana JZ/JW ma zatwierdzony odczyt zdjęcia albo administracyjne ręczne potwierdzenie,
- czerwony status **Niepotwierdzone** pokazuje również licznik, np. `1/2`, aby od razu było wiadomo, ile tabliczek pozostało do sprawdzenia,
- jeżeli montaż nie ma jeszcze urządzeń ani tabliczek, tabela pokazuje neutralne **Brak urządzeń** zamiast fałszywego zielonego statusu,
- w karcie każdego JZ/JW administrator może użyć **Potwierdź ręcznie**, również gdy zdjęcia tabliczki nie ma; potwierdzenie można później cofnąć,
- ręczne potwierdzenie jest zapisywane oddzielnie od zdjęcia i nie udaje, że zdjęcie istnieje,
- nowa tabela `nameplate_manual_verifications` jest dostępna wyłącznie dla administratora przez RLS,
- **mobile pozostaje bez zmian**: ręczne potwierdzenie administratora nie pozwala pracownikowi ominąć obowiązkowych zdjęć tabliczek przy zakończeniu montażu,
- przed wdrożeniem funkcji ręcznego potwierdzania uruchom w Supabase SQL Editor plik `nameplate-manual-verifications-v9.13.sql`.

## Odczyt tabliczek: kody + AI, bez lokalnego OCR — 9.12

- pozostają tylko dwa sposoby odczytu: **Odczytaj kody** oraz **Odczytaj przez AI**,
- `Odczytaj kody` analizuje wyłącznie rzeczywiste EAN-13 / Code 128 / Code 39; tekst z obrazu nie może zostać uznany za kod kreskowy,
- EAN i numer seryjny pozostają rozdzielone: EAN-13 zasila katalog produktu, a Code 128/39 może zasilać SN,
- AI odczytuje nadrukowaną markę, dokładny kod modelu, moc i w razie potrzeby numer seryjny lub EAN widoczny na zdjęciu,
- twarde wyniki kodów kreskowych mają pierwszeństwo przed wynikiem AI,
- model Rotenso odczytany przez AI jest oznaczany jako potwierdzony dopiero po dokładnym dopasowaniu do katalogu Rotenso; niepotwierdzony model AI jest blokowany przed automatycznym zapisem, dopóki administrator nie poprawi go ręcznie lub nie wyłączy zapisu modelu,
- usunięto `src/modules/desktop-nameplate-ocr.js` oraz cały `public/ocr/` z Tesseractem i danymi językowymi,
- zachowano walidację `Xi -> JW`, `Xo -> JZ`, `Xm -> JZ` oraz pełny katalog 214 kodów Rotenso,
- mobile i baza Supabase bez zmian; brak nowej migracji SQL.

## Różne układy etykiet bez wymuszania EAN-u — 9.11

- klasyczny układ `PC/EAN + SN` z 9.10 pozostaje bez zmian,
- dodano obsługę etykiet, na których kod kreskowy Code 128 zawiera numer seryjny, a kod modelu (np. `R35Xi R18`) jest nadrukowany nad kodem,
- brak EAN-u nie jest błędem, jeśli aplikacja ma pewny model z nadruku i pewny numer seryjny z Code 128,
- model jest odczytywany osobnym, skupionym OCR-em tylko z górnej części etykiety i musi odpowiadać dokładnemu kodowi istniejącemu w katalogu Rotenso 9.02,
- pojedynczy słaby wynik OCR modelu nie jest automatycznie zapisywany; wymagane są dwa zgodne przebiegi albo jeden wynik o wysokiej pewności,
- ograniczone korekty OCR dotyczą wyłącznie jednoznacznego markera `Xi/Xo` (`X1 -> Xi`, `X0 -> Xo`) i nadal muszą prowadzić do dokładnego modelu z katalogu,
- znany kod modelu nie może zostać omyłkowo potraktowany jako numer seryjny, nawet jeśli znajduje się w Code 128,
- realny przypadek `R35Xi R18 / SN 140201BFT7N28261B000931` ma dedykowany test regresyjny,
- mobile bez zmian i brak nowej migracji SQL.


## Uniwersalny odczyt kodów bez zgadywania SN — 9.10

- przycisk **Odczytaj EAN / Code 128** najpierw uruchamia uniwersalny dekoder kodów kreskowych obsługujący EAN-13 i Code 128 także tam, gdzie przeglądarka nie udostępnia natywnego `BarcodeDetector`,
- zdjęcie jest skanowane w kilku zachodzących na siebie pasach, dzięki czemu górny kod PC/EAN i dolny kod SN są wykrywane niezależnie od dokładnego położenia na tabliczce,
- EAN-13 i Code 128 pozostają dwoma różnymi źródłami: EAN zasila katalog produktu, a Code 128 zasila numer seryjny,
- numer seryjny odczytany bezpośrednio z kodu kreskowego ma pierwszeństwo przed OCR,
- automatyczny OCR SN nie wpisuje już pierwszego „podobnego” ciągu; wynik OCR jest zapisywany wyłącznie, gdy identyczny numer z jawnego pola `SN/Serial` pojawi się w co najmniej dwóch niezależnych przebiegach,
- pojedynczy fragment taki jak `0034B110171918` pozostaje wyłącznie w diagnostyce i nie trafia do pola numeru seryjnego,
- usunięto awaryjne wybieranie przez interfejs najdłuższego ciągu alfanumerycznego z surowych wyników,
- realny przypadek `I35Xi R14 / PC/EAN 5905567600791 / SN 540S25420034B110171916` ma dedykowany test regresyjny,
- poprawki 9.09 dotyczące `Xi/JW`, `Xo/JZ`, `Xm/JZ` oraz ochrony oficjalnego katalogu Rotenso pozostają aktywne,
- brak nowej migracji SQL; jeżeli naprawa katalogu z 9.09 została już uruchomiona, w 9.10 nie trzeba wykonywać SQL.

Czytnik ZXing jest ładowany leniwie tylko podczas odczytu tabliczki. Jeżeli nie może się uruchomić, aplikacja zachowuje dotychczasowy natywny czytnik, lokalny dekoder EAN-13 i ostrożny fallback OCR.

## Jednoznaczne PC/EAN, SN i JW/JZ — 9.09

- lokalny OCR nie przeszukuje już całego tekstu tabliczki w poszukiwaniu dowolnego 13-cyfrowego ciągu z poprawną sumą kontrolną; EAN jest akceptowany wyłącznie z jawnie oznaczonego pola `PC/EAN`, `EAN` lub `GTIN`,
- wynik `printed_text` z obszaru `SN` ani numeryczny `Code 128` nie może zostać automatycznie zaklasyfikowany jako EAN-13,
- naprawiono błąd wielkości liter `JZ`/`jz`, który przy zapisie potwierdzonego skanu mógł oznaczyć jednostkę zewnętrzną jako `indoor`,
- kod modelu ma pierwszeństwo przy klasyfikacji typu: `Xi → indoor/JW`, `Xo → outdoor/JZ`, `Xm2..Xm5 → outdoor/JZ`,
- dla EAN-ów obecnych w oficjalnym wbudowanym katalogu Rotenso dane producenta są nadrzędne i nie mogą zostać nadpisane przez rekord `confirmed_scan`,
- test regresyjny obejmuje dokładne przypadki `I35Xo R14 / 5905567600807` oraz `I35Xi R14 / 5905567600791 / SN 540S25420034B110171916`, a także zgodność JW/JZ wszystkich 214 kodów,
- do paczki dodano idempotentny `nameplate-product-catalog-repair-official-v9.09.sql`, który przywraca 183 aktualne oficjalne wpisy Rotenso w centralnym katalogu bez zmiany schematu bazy.

Po wdrożeniu 9.09 uruchom jednorazowo `nameplate-product-catalog-repair-official-v9.09.sql` w Supabase SQL Editor, aby wyczyścić ewentualne błędne `unit_type` zapisane przez starszą wersję. Aplikacja 9.09 sama chroni się przed takim rekordem, ale naprawa porządkuje centralny katalog.

## Uproszczone nowe zlecenie + zwarte menu desktop — 9.08

W oknie **Nowy montaż / zlecenie** nie ma już bloku **Urządzenia w montażu**, przełącznika single/multi ani pól modelu i numerów seryjnych. Urządzenia są uzupełniane później podczas realizacji montażu. Przy edycji istniejącego zlecenia dotychczasowa sekcja urządzeń pozostaje dostępna, więc nie tracimy możliwości podglądu i korekty starszych danych.

Lewy pasek administratora zachowuje ten sam układ i szerokość, ale ma mniejszą czcionkę pozycji (17 px zamiast 18 px), nieco niższe przyciski i mniejsze odstępy. Zmiana jest wyłącznie desktopowa i ma usunąć drobne pionowe przewijanie przy niższej wysokości okna przeglądarki.

Nie ma nowej migracji SQL.

## Natywne dyktowanie bez płatnego API — 9.07

Przycisk **Wprowadź głosowo** oraz mikrofony przy pojedynczych polach korzystają wyłącznie z `SpeechRecognition` / `webkitSpeechRecognition`, jeżeli przeglądarka udostępnia tę funkcję. Nie ma fallbacku `MediaRecorder`, nie ma wysyłania nagrania do `/api/transcribe-client-voice` i zwykłe dyktowanie klienta nie zużywa kredytów OpenAI.

Na desktopie użyj aktualnego **Chrome lub Edge**. Na iPhonie użyj **Safari** i zezwól stronie na mikrofon; jeżeli system tego wymaga, Siri musi być włączona. **Firefox** nie obsługuje tego mechanizmu w tej aplikacji — zamiast próby płatnej transkrypcji aplikacja wyświetla jasną informację o zmianie przeglądarki.

`OPENAI_API_KEY` może nadal istnieć w Vercel dla osobnej, ręcznie uruchamianej funkcji **Odczytaj przez AI** przy tabliczkach znamionowych. Nie jest używany przez dyktowanie danych klienta.

Nie ma nowej migracji SQL.

## Historia 9.06 — wycofany fallback desktopowy

Wersja 9.06 wprowadzała fallback `MediaRecorder` + serwerową transkrypcję OpenAI dla Firefox. Mechanizm został usunięty w 9.07 z powodu kosztu API i zależności od salda kredytów. 9.07 zastępuje ten sposób działania.

## Naturalne głosowe dane klienta bez komend — 9.05

Wersja 9.05 usuwa konieczność wypowiadania nazw pól. Pracownik może podać dane naturalnym ciągiem, np. `Piotr Wasik Widna 19 przez 19 Zawiercie wasik p małpa e kropka pe el 606 606 909`. Aplikacja oddziela klienta, ulicę, numer domu i lokalu, miejscowość, e-mail i telefon.

Telefon jest wykrywany wyłącznie jako spójny 9-cyfrowy numer (lub numer z prefiksem +48), więc cyfry `19/19` z adresu nie mogą zostać do niego doklejone. Safari może zwrócić kilka wariantów rozpoznania; aplikacja prosi teraz o maksymalnie 5 alternatyw i wybiera wariant, który najlepiej pasuje do struktury danych klienta. Jeżeli e-mail jest niekompletny, np. Safari zwróci `@.pl`, aplikacja pozostawia pole e-mail puste i pokazuje ostrzeżenie zamiast zgadywać.

Nie ma nowej migracji SQL.

## Automatyczny OCR brakującego numeru seryjnego — 8.99

Po kliknięciu **Odczytaj EAN / Code 128** aplikacja zapisuje każdy uzyskany wynik niezależnie. Jeżeli EAN i model zostały rozpoznane, ale dolny kod Code 128 nie zwrócił numeru seryjnego, uruchamiany jest automatycznie szybki lokalny OCR ograniczony do dolnej części tabliczki i nadruku `SN`. Administrator nie musi drugi raz wybierać przycisku **Odczytaj nadruk OCR**.

Pełny lokalny OCR całej tabliczki jest nadal uruchamiany, gdy brakuje także EAN-u lub modelu. Numer seryjny odczytany z nadruku jest oznaczany jako wymagający ręcznego porównania znak po znaku. Analiza AI pozostaje wyłącznie ręczna i nie generuje kosztu bez kliknięcia. Nie ma nowej migracji SQL.


## Centrum synchronizacji zdjęć na telefonie — 8.98

Wersja 8.98 rozwija istniejącą lokalną kolejkę zdjęć bez zmiany sposobu zapisu montaży. Pracownik może dotknąć statusu połączenia i zdjęć w górnej części aplikacji, aby otworzyć **Centrum synchronizacji zdjęć**.

Centrum pokazuje zdjęcia zapisane wyłącznie na tym telefonie, zdjęcia aktualnie wysyłane oraz pozycje zakończone błędem. Każdy wpis zawiera rodzaj zdjęcia lub tabliczki, nazwę klienta, adres zlecenia, czas dodania, liczbę prób i ostatni komunikat błędu. Dostępne są akcje **Wyślij**, **Wyślij wszystkie**, **Odśwież** oraz **Otwórz zlecenie**.

Lista jest filtrowana do aktualnie zalogowanego pracownika. Zdjęcia z błędem są uwzględniane przy ręcznym „Wyślij wszystkie”, ale nadal korzystają z zabezpieczeń deduplikacji i blokady równoległego uploadu z wersji 8.82. Ostatni czas poprawnej synchronizacji jest zachowywany lokalnie na telefonie. Przy braku internetu przyciski wysyłania są zablokowane, a zdjęcia pozostają w IndexedDB. Nie ma nowej migracji SQL. Kontrola regresji: `npm run test:smoke:mobile-photo-sync-center`.


## Diagnostyka i kontrola prawdziwego wyglądu — 8.97

Wersja 8.97 nie zmienia działania montaży, OCR-u, zdjęć ani danych. Dodaje narzędzia, które ułatwiają ustalenie przyczyny błędu i blokują wydanie aplikacji z niezaładowanym CSS lub rozsypanym układem.

Administrator ma w desktopowym menu pozycję **Diagnostyka**. Przycisk **Pobierz raport diagnostyczny** tworzy plik JSON zawierający wersję aplikacji, przeglądarkę, rozmiar ekranu, stan połączenia, wykorzystanie pamięci oraz ostatnie błędy techniczne. Na telefonie ten sam raport można pobrać z ikony dokumentu w górnym pasku; mobilny raport zawiera dodatkowo liczbę zdjęć zapisanych lokalnie, wysyłanych i zakończonych błędem.

Raport nie zawiera zdjęć, treści komentarzy, nazw klientów, adresów, telefonów ani e-maili. Tokeny, podpisane adresy plików i nazwy plików są maskowane. Najlepiej pobrać raport od razu po wystąpieniu problemu, przed odświeżeniem strony.

Przed wydaniem Playwright uruchamia pełną aplikację na rzeczywistym renderze Chromium dla desktopu oraz profilu iPhone. Test kontroluje między innymi załadowanie głównego fontu/CSS, brak poziomego przepełnienia, poprawny podział kolumn oraz brak skrajnie dużego lub małego tekstu. Screenshoty `desktop-release-visual.png` i `mobile-release-visual.png` są obowiązkowo sprawdzane i publikowane jako artefakty GitHub Actions. Brak poprawnego screenshota oznacza czerwone wydanie.

## Automatyczny lokalny odczyt PC/EAN i SN — 8.96

Wersja 8.96 usuwa zależność desktopowego czytnika tabliczek od zewnętrznego CDN. Po kliknięciu „Odczytaj EAN / Code 128” aplikacja najpierw używa natywnego czytnika przeglądarki i własnego lokalnego dekodera EAN-13. Gdy kreski kodu nie dadzą kompletu danych, automatycznie uruchamia lokalny OCR nadruków `PC/EAN`, `SN` oraz kodu modelu. Nie trzeba drugi raz klikać „Odczytaj nadruk OCR”.

Dla zgłoszonej tabliczki `RO35Xi R14` test regresyjny pilnuje wartości `5905567601132` oraz `540V9839703A70010130182`. Numer seryjny odczytany z nadruku jest oznaczony jako „Warto sprawdzić”, natomiast dokładny EAN nadal korzysta z katalogu Rotenso 8.95 i katalogu centralnego Supabase. Operacja ma limit czasu i można ją przerwać przez zamknięcie okna. Nie ma nowej migracji SQL.

## Rozszerzony katalog EAN Rotenso — 8.95

Wersja 8.95 dodaje **109 potwierdzonych kodów EAN/GTIN Rotenso** dla najczęściej spotykanych rodzin ściennych: Imoto, Ukura, Revio, Mirai, Teta, Roni, Elis, Luve, Versu i Fresh, wraz z wariantami kolorystycznymi oraz rozróżnieniem JW/JZ i rewizji R14–R18. Nie są wpisywane numery zgadywane — każda pozycja ma prawidłową sumę kontrolną EAN-13 i pochodzi z katalogu producenta lub zweryfikowanego katalogu dystrybutora.

Katalog działa w dwóch warstwach:

- **wbudowany fallback** — rozpoznaje 109 kodów EAN/GTIN i od razu wpisuje markę, model oraz moc, również przy chwilowym braku odpowiedzi Supabase;
- **centralny katalog Supabase** — może nadpisywać, poprawiać i rozszerzać dane na wszystkich komputerach bez kolejnej wersji aplikacji.

Dla istniejącej bazy uruchom po wcześniejszej migracji 8.92 plik `nameplate-product-catalog-full-current-v9.02.sql`. Aktualny pełny zestaw jest dostępny jako `wawis-katalog-ean-rotenso-v9.02.csv`; aplikacja zachowuje też starsze rewizje i aliasy używane przy już zamontowanych urządzeniach.

## Stabilny podgląd i zapis Code 128 — 8.94

Wersja 8.94 naprawia przypadek, w którym po poprawnym odczycie EAN i Code 128 znikało zdjęcie, a pola modelu i numeru seryjnego pozostawały puste. Przyczyną było odświeżenie podpisanego URL tego samego zdjęcia przez Supabase. Komponent traktował zmianę czasowego adresu jak podmianę pliku, czyścił podgląd i anulował operację pomiędzy wykryciem kodów a wypełnieniem formularza.

Obszar roboczy jest teraz powiązany ze stałą tożsamością rekordu zdjęcia. Zmiana czasowego URL nie resetuje pliku, kadru ani bieżącego odczytu. Numer seryjny z Code 128 trafia do pola natychmiast, jeszcze przed sprawdzaniem centralnego katalogu EAN. Nie ma nowej migracji SQL.

## Nieblokujący odczyt tabliczki — 8.93

Okno OCR otwiera się natychmiast, a odczyt EAN/Code 128, lokalny OCR nadruku i AI są osobnymi operacjami z limitami czasu i anulowaniem.

## Centralny katalog EAN — 8.92

Desktop może korzystać ze wspólnego katalogu EAN/GTIN w Supabase oraz importu CSV/XLSX. Wdrożenie katalogu wymaga jednorazowego uruchomienia `nameplate-product-catalog-v8.92.sql`.



## Pewny odczyt starszej tabliczki Rotenso — 8.91

Wersja 8.91 uzupełnia mapowanie EAN `5905567600821` dla modelu `Rotenso Imoto 5,0 kW (I50Xo R14)`. Czytnik kodów po niepełnym wyniku uruchamia lokalny OCR nadruku, aby odzyskać dokładny kod modelu lub numer seryjny bez kosztu AI.

Dodano także kontrolę zgodności tabliczki z miejscem zapisu: kod `Xo` (jednostka zewnętrzna) nie zostanie wpisany do pola `JW`, a kod `Xi` nie zostanie wpisany do `JZ`. Aplikacja wyświetla wtedy jasny komunikat o błędnie przypisanym zdjęciu. Nie ma nowej migracji SQL.


## Naprawa usuwania komentarzy — 8.90

Wersja 8.90 naprawia zawieszające się okno `Usunąć komentarz?`. Po skutecznym usunięciu komentarza modal zamyka się natychmiast, a odświeżenie listy zleceń i szczegółów działa w tle. Operacje sieciowe mają limit czasu, więc przy problemie z połączeniem przycisk nie pozostaje bez końca w stanie `Trwa...`. Ponowne usunięcie komentarza, którego nie ma już w bazie, jest traktowane jako poprawnie zakończone.

Zmiana dotyczy mechanizmu komentarzy na desktopie i jego wspólnego odpowiednika mobilnego. Nie wymaga migracji SQL i nie zmienia wyglądu, zdjęć, tabliczek ani danych klientów.


## Szersza tabela i podgląd tabliczki z wiersza — 8.89

Wersja 8.89 rozwija działającą tabelę z 8.88. Usunięto osobną kolumnę `Akcje`, aby na ekranie iPhone’a zwiększyć szerokość kolumny `Status`, zachować cały nagłówek w jednej linii i powiększyć odstęp od zielonego potwierdzenia. Tabela ma teraz cztery kolumny: `Urządzenie`, `Model / moc`, `Tabliczka` i `Status`.

Cały wiersz JZ lub JW jest klikalny. Dla zapisanej tabliczki dotknięcie oznaczenia jednostki, modelu, opisu tabliczki albo statusu otwiera istniejący podgląd zdjęcia. Przy błędzie wiersz ponawia wysyłkę, a przy brakującej tabliczce otwiera edycję urządzeń. Krytyczne style nadal są osadzone razem z komponentem, bez zmian w głównym CSS, synchronizacji zdjęć, desktopie i Supabase. Nie ma nowej migracji SQL.

## Mobilna tabela urządzeń odporna na cache — 8.88

Wersja 8.88 została przygotowana na stabilnej bazie 8.86 i zmienia wyłącznie sekcję `Urządzenia i tabliczki` w mobilnej karcie montażu. Tabela ma pięć osobnych kolumn: `Urządzenie`, `Model / moc`, `Tabliczka`, `Status` i `Akcje`. JZ jest oznaczone na niebiesko, a JW na zielono.

Najważniejsza naprawa techniczna polega na tym, że krytyczny CSS tabeli jest dostarczany razem z modułem JavaScript komponentu i osadzany bezpośrednio w widoku. iPhone nie może już uruchomić nowego komponentu z poprzednią, zapamiętaną wersją stylów tabeli. Stabilny bootstrap całej aplikacji z 8.86 pozostaje bez zmian. Nie ma nowej migracji SQL.


## Awaryjne przywrócenie stabilnej aplikacji — 8.86

Wersja 8.86 wycofuje nieudane zmiany wizualne 8.83–8.85 i wraca do stabilnego interfejsu z wersji 8.82. Zachowuje obsługę wielu adresów klienta oraz naprawę synchronizacji i duplikowania zdjęć. Mobilna aplikacja, główny arkusz CSS i arkusz tabel są ponownie ładowane razem przed uruchomieniem Reacta. `index.html` ma dodatkowo minimalny styl awaryjny, który zapobiega wyświetleniu surowej strony HTML, gdyby główny CSS nie został pobrany.


## Wiele adresów jednego klienta — 8.81

Jeden klient może mieć teraz kilka nazwanych lokalizacji, na przykład `Dom`, `Firma` i `Magazyn`, z jednym adresem głównym. Administrator wybiera właściwy adres podczas tworzenia montażu albo dopisuje nowy bez zakładania drugiej karty klienta.

Każde zlecenie zachowuje własną kopię adresu, więc późniejsza zmiana kartoteki nie modyfikuje historii. Pełna lista adresów jest również zachowywana w eksporcie/imporcie XLSX i uwzględniana przez globalne wyszukiwanie desktopowe. Przed wdrożeniem należy uruchomić migrację `contractor-addresses-v8.81.sql` w Supabase SQL Editor.


## Porządek i kompletność testów — 8.80

Wersja 8.80 nie dodaje funkcji użytkowych. Usuwa martwy moduł `Serwisy`, stary endpoint Resend, osierocone testy wizualne i nieużywane grafiki. Przestarzały tekst w mobilnym Playwright został dopasowany do statusu `Zakończone · tylko podgląd`, a wartościowe kontrole kadrowania OCR przeniesiono do aktywnego testu desktopowego.

Pipeline desktopowy uruchamia teraz prawdziwy `test:e2e:desktop` oraz istniejące testy bezpieczeństwa RLS, Centrum 360, białego ekranu tabliczek i AI/kodów. Mobilny Playwright sprawdza dodatkowo, czy zdjęcie zapisane offline przetrwa ponowne uruchomienie i wyśle się po odzyskaniu internetu oraz czy pusta sekcja komentarzy zakończonego zlecenia jest ukryta, a istniejąca historia pozostaje widoczna.

## Automatyczna kontrola wydania mobile — 8.79

Dodano osobny workflow GitHub Actions `.github/workflows/mobile-release-checks.yml`. Po pushu do `main`, każdej aktualizacji pull requestu do `main` albo ręcznym uruchomieniu pobiera zależności wyłącznie z publicznego npm, instaluje Chromium i uruchamia ten sam `npm run release:mobile -- --skip-version-bump`, którego używamy lokalnie.

Oznacza to dwa przebiegi wszystkich mobilnych smoke testów, dwa przebiegi rzeczywistego testu telefonu w Playwright, `verify:release` x2, produkcyjny build x2, `verify:bundle` x2, utworzenie ZIP-a i kontrolę jego zawartości. Paczka, `RELEASE-RESULT.md` oraz diagnostyka Playwright po błędzie są zachowywane jako artefakty. GitHub pokazuje wynik `ZIELONY` tylko po pełnym sukcesie albo `CZERWONY` po dowolnym błędzie; czerwonej wersji nie wolno publikować.

Test `npm run test:smoke:mobile-ci` kontroluje, czy workflow nadal ma wszystkie wymagane kroki i czy trafia do końcowego ZIP-a. Przy uruchomieniu pełnego zestawu wykryto również i naprawiono usuwanie spacji podczas wpisywania wielowyrazowego modelu urządzenia; końcowy zapis nadal normalizuje brzegi tekstu. Nie dodano nowych modułów ani zmian w Supabase.

## Stabilny rejestr npm i build — 8.78

Dodano projektowy plik `.npmrc`, który ustawia publiczny rejestr `https://registry.npmjs.org/`, włącza zależności opcjonalne oraz wyłącza automatyczne `audit` i komunikaty `fund`. Skrypt `prepare:deps` dodatkowo przekazuje publiczny rejestr bezpośrednio do uruchamianych komend npm, dzięki czemu build nie korzysta z przypadkowego rejestru ustawionego globalnie w środowisku.

Dodano test `test:smoke:npm-registry`, który sprawdza zawartość `.npmrc`, wymuszenie rejestru w skrypcie builda oraz obecność `.npmrc` w końcowej paczce ZIP. Funkcje aplikacji mobilnej, desktop administratora i baza Supabase pozostają bez zmian.

## Puste komentarze na zakończonych zleceniach — mobile 8.77

Na zakończonej karcie montażu pracownika sekcja `Komentarze i pytania` jest automatycznie ukrywana, gdy po załadowaniu szczegółów nie ma żadnego komentarza. Jeżeli komentarz istnieje, pozostaje widoczny. Dla aktywnych zleceń sekcja nadal jest dostępna do wpisywania, a podczas pobierania szczegółów nadal pokazuje stan ładowania.

Zmiana dotyczy wyłącznie aplikacji mobilnej pracownika. Desktop administratora, statusy synchronizacji zdjęć i baza Supabase pozostają bez zmian.

## Uproszczenie aplikacji mobilnej 8.76

Na ekranie szczegółów zakończonego montażu pracownik widzi teraz jeden status `Zakończone · tylko podgląd` zamiast trzech powtarzających się opisów. Skrócono komunikaty pustych sekcji, usunięto powtórzone nagłówki tabliczek w kreatorze oraz stałą instrukcję o wymaganych tabliczkach z jego podsumowania.

Statusy operacyjne zdjęć (`Zapisano na telefonie`, `Wysyłanie`, `Zapisano w systemie`, `Błąd wysyłania`) pozostają bez zmian. Desktop administratora i baza Supabase nie zostały zmienione.

## Odczyt tabliczek na desktopie 8.75

Administrator ma dwie jawne metody odczytu: dokładny czytnik `EAN / Code 128` oraz analizę obrazu przez AI uruchamianą ręcznie. Aplikacja nie dopasowuje już rodziny Rotenso na podstawie podobnej litery. Przy każdym polu pokazuje źródło danych, a zapis następuje wyłącznie po ręcznym zatwierdzeniu.

W aplikacji mobilnej OCR i AI pozostają wyłączone. Zdjęcie tabliczki jest nadal źródłem prawdy.

### Konfiguracja Vercel dla analizy AI

Dodaj w projekcie Vercel zmienną środowiskową `OPENAI_API_KEY` dla środowiska Production. Opcjonalnie dodaj `OPENAI_NAMEPLATE_MODEL` (domyślnie `gpt-5.6`). Klucz jest używany wyłącznie w funkcji serwerowej `api/read-nameplate-ai.js` i nie trafia do przeglądarki. Zdjęcie jest wysyłane do OpenAI wyłącznie po świadomym kliknięciu „Odczytaj przez AI”; zwykłe otwarcie tabliczki i odczyt kodów nie uruchamiają płatnej analizy AI.

Wersja 8.69 zamienia desktopowy odczyt tabliczek w pełny ekran pracy z OCR-em. Po lewej stronie administrator widzi duże zdjęcie z powiększaniem, obrotem i poprawą kontrastu, a po prawej stronie ma markę, model, moc, numer seryjny oraz surowy wynik OCR. Kolorowa pewność pól pozostaje aktywna, a zapis do bazy nadal następuje dopiero po ręcznym zatwierdzeniu. Mobilna aplikacja pracownika pozostaje całkowicie bez OCR-u.

Wersja 8.67 uporządkowała desktopową kartę urządzeń: model, numer seryjny, tabliczka i status OCR są pokazane razem przy właściwej JZ/JW.

# Klima App

Aplikacja do katalogowania montaży klimatyzatorów dla firmy Wawis Klimatyzacja.

## Aktualna wersja
- 9.81
- numer wersji trzymamy w `app-version.json`, `package.json`, `package-lock.json` i `src/version.js`
- kolejną wersję zawsze zwiększamy o 1 na końcu, np. `7.15 -> 7.16`, a po `7.99` przechodzimy na `8.00`
- pełna historia zmian znajduje się w `CHANGELOG.md`

## Głosowe wprowadzanie danych klienta 9.04
- pełne dyktowanie nie kończy się po pierwszej frazie rozpoznanej przez Safari; aplikacja utrzymuje sesję i automatycznie łączy kolejne fragmenty aż do kliknięcia `Zakończ i sprawdź`,
- podczas mówienia widać na żywo tekst `Usłyszano do tej pory`, dzięki czemu pracownik od razu widzi, czy Safari nadal słucha,
- parser rozumie adresy wypowiadane naturalnie, np. `ulica Widna 19 przez 19 Zawiercie` → `Widna 19/19`, miejscowość `Zawiercie`,
- dodano głosowy e-mail, w tym formę `wasik małpa e kropka pe el` → `wasik@e.pl`,
- mikrofon przy pojedynczym polu nie jest ponownie uruchamiany przed zakończeniem poprzedniej sesji, co ogranicza błędy `audio-capture` na iPhonie,
- nadal można poprawić każde rozpoznane pole ręcznie lub osobnym mikrofonem,
- kod pocztowy jest zapisywany razem z miejscowością, a numer domu/lokalu razem z ulicą, zgodnie z dotychczasowym modelem bazy,
- brak nowej migracji SQL i brak zmian w zdjęciach, OCR tabliczek, komentarzach oraz katalogu Rotenso.

## Wiele adresów klienta 8.81
1. Przed wdrożeniem aplikacji uruchom w Supabase SQL Editor cały plik `contractor-addresses-v8.81.sql`.
2. Migracja nie usuwa danych: dotychczasowe pola `city` i `street` zostają zachowane jako adres główny i są przenoszone do listy `addresses`.
3. Na karcie kontrahenta można dodać kolejne lokalizacje, nazwać je np. `Dom`, `Firma` lub `Magazyn` i wskazać adres główny.
4. W formularzu montażu po wybraniu klienta pojawia się lista jego adresów oraz opcja dopisania nowej lokalizacji.
5. Każdy montaż nadal zapisuje własne `city`, `street` i `location`, dlatego zmiana kartoteki klienta nie zmienia starych zleceń.
6. Pracownik mobilny widzi wyłącznie adres przypisany do danego montażu; jego ekran nie został rozbudowany o zarządzanie adresami.
7. Eksport XLSX zachowuje wszystkie adresy w kolumnie `Adresy (JSON)`, a import odtwarza pełną listę lokalizacji.
8. Globalne wyszukiwanie desktopowe znajduje klienta również po dodatkowym adresie, nazwie lokalizacji i notatce.

## Ostatnia poprawka
- wersja `10.26` — produkcyjne Paliwo dla pracowników, raport miesięczny, korekty administratora i kontrola szybkiego ponownego tankowania.
- wersja `10.10` — trwały punkt wznowienia, przyrostowe odświeżanie, cicha diagnostyka, lepsza kolejka zdjęć i zewnętrzna kopia zdjęć oraz protokołów.
- wersja `9.99` — mobilny wykonawca zakończenia jest pokazany bez `Przez:` i w jednej linii, a strzałki, numery oraz wielokropek paginacji mieszczą się w jednym rzędzie.
- wersja `9.98` — data i wykonawca zakończenia są odsunięci oraz wyśrodkowani, a karty urządzeń na telefonie są domyślnie zwinięte i rozwijane osobno.
- wersja `9.97` — nagłówek i tabele protokołu powykonawczego są zwarte i wyrównane, REGON usunięto, a informacje i ustalenia mają większą czcionkę.
- wersja `9.96` — administrator może na desktopie podejrzeć, wydrukować i wysłać zapisany protokół zakończonego zlecenia.
- wersja `9.84` — protokół mobilny ma uporządkowane wiersze danych i karty urządzeń, a podpis klienta otwiera się na osobnym, nieruchomym ekranie z osobnym zatwierdzeniem.
- wersja `9.83` — protokół mobilny korzysta z tej samej pełnoekranowej obudowy i pojedynczego głównego elementu co działające okno „Dodaj urządzenie”.
- test `npm run test:smoke:technical-refresh` pilnuje, aby pełne odświeżenia nie wróciły do pojedynczych akcji, PUSH pozostał ograniczony, Centrum 360 używało cache, a timer offline nie działał przy pustej kolejce.
- wersja `9.75` — desktop i mobile mają odseparowane, ograniczone czasowo pobieranie szczegółów zlecenia; Realtime odświeża konkretne zlecenia, miniatury ładują się w tle, a chwilowy 500/504 nie zapętla spinnera ani nie usuwa ostatnich poprawnych danych.
- wersja `9.73` — usuwanie błędnego urządzenia nie rusza już fizycznych plików tabliczek pozostałych urządzeń; przypisanie tabliczki do urządzenia jest osobnym polem w bazie, a współdzielony plik jest chroniony przed usunięciem.
- wersja `9.72` — administrator może usunąć błędnie zapisane urządzenie bezpośrednio z tabeli urządzeń; usuwane są też jego tabliczki, a kolejne urządzenia są przenumerowywane.
- wersja `9.70` — PUSH jest obowiązkowy i bez możliwości wyłączenia w aplikacji; aplikacja sama naprawia brakującą subskrypcję oraz wymienia endpoint wygasły po 404/410.
- wersja `9.36` — strzałki galerii zdjęć montażu nie pokazują już tabliczek znamionowych; obie galerie są od siebie odseparowane.
- wersja `9.35` — desktopowy kreator urządzeń jest węższy, wypełnia swoją powierzchnię bez bocznych pasów i ma neutralny grafitowy wygląd premium.
- wersja `9.34` — desktopowe okno urządzeń administratora jest zwarte, profesjonalnie uporządkowane i pozbawione dużej pustej powierzchni.
- wersja `9.33` — przeciążenie Supabase pokazuje czytelny komunikat, nie udaje błędu autoryzacji i nie wylogowuje użytkownika.
- wersja `9.32` — `Odczytaj kody` korzysta z pełnego katalogu modeli Rotenso; `ES50Xi R17` daje Rotenso, Elis Silver, 5,0 kW i JW bez AI.
- wersja `9.30` — AI rozpoznaje dokładny kod Rotenso także z pełnej transkrypcji; `EO50Xo R17` uzupełnia Rotenso, Elis 5,0 kW i jednostkę zewnętrzną.
- wersja `9.29` — administrator może dodawać i edytować urządzenia oraz zdjęcia tabliczek na desktopie i mobile.
- wersja `9.26` — desktop i mobile: kolejne nagrania komentarza administratora są dopisywane do istniejącej treści zamiast ją zastępować.
- wersja `9.24` — desktop Montaże: niezależne przewijanie lewej listy i prawego panelu szczegółów po otwarciu zlecenia; kółko myszy nad tabelą przewija lewą listę.
- wersja `9.18` — mobile administratora: jawna Diagnostyka oraz bezpieczne przenoszenie zweryfikowanej subskrypcji push między kontami na tym samym iPhonie bez poluzowania RLS.
- wersja `9.17` — push administratora: automatyczna synchronizacja subskrypcji z Supabase, test push bez zamykania zlecenia oraz kontrolowany retry dla zakończeń.
- wersja `9.09` — desktop: rozdzielenie PC/EAN od SN, naprawa klasyfikacji Xi/Xo/JW/JZ i ochrona oficjalnego katalogu Rotenso przed błędnym nadpisaniem.
- wersja `9.06` — historyczna próba fallbacku MediaRecorder/OpenAI dla Firefox, wycofana w 9.07.
- wersja `9.05` — naturalne dyktowanie danych klienta bez nazw pól; telefon jest izolowany od cyfr adresu, Safari wybiera lepszą alternatywę rozpoznania, a niepełny e-mail nie jest zgadywany.
- wersja `9.00` — mobilny zapis tabliczek zamyka modal po potwierdzeniu, odświeża dane w tle i zapisuje etapy do diagnostyki.
- wersja `8.99` — po odczycie EAN/Code 128 brakujący numer seryjny jest automatycznie uzupełniany przez lokalny OCR tylko obszaru SN.
- wersja `8.98` — dodano mobilne Centrum synchronizacji zdjęć z listą kolejki, ponawianiem pojedynczym i zbiorczym oraz przejściem do zlecenia.
- wersja `8.94` — naprawiono znikanie zdjęcia i anulowanie wyniku po odświeżeniu podpisanego URL; numer seryjny z Code 128 trafia do formularza przed sprawdzaniem katalogu EAN.
- wersja `8.93` — rozdzielono odczyt EAN/Code 128, lokalny OCR i AI na osobne operacje z limitami czasu oraz anulowaniem.
- wersja `8.92` — dodano centralny katalog EAN/GTIN w Supabase i import CSV/XLSX; wymaga `nameplate-product-catalog-v8.92.sql`.
- wersja `8.91` — dodano brakujące mapowanie EAN starszego Imoto, lokalny OCR awaryjny dla nadruku modelu/SN oraz blokadę zapisania tabliczki JZ do JW lub odwrotnie.
- wersja `8.89` — poszerzono kolumnę statusu, usunięto osobną kolumnę akcji i umożliwiono otwieranie tabliczki po dotknięciu całego wiersza JZ/JW.
- wersja `8.88` — na stabilnej bazie 8.86 wdrożono pięciokolumnową mobilną tabelę urządzeń; jej krytyczne style są osadzane razem z komponentem JS, aby iPhone nie mógł użyć starego CSS dla nowego układu.
- wersja `8.86` — awaryjnie przywrócono stabilny interfejs 8.82, zachowując wiele adresów i naprawę zdjęć; dodano ochronę przed wydaniem aplikacji bez mobilnego CSS.
- wersja `8.81` — dodano wiele adresów jednego klienta, wybór lokalizacji przy tworzeniu montażu oraz zachowanie historycznego adresu na każdym zleceniu. Przed wdrożeniem uruchom w Supabase SQL Editor plik `contractor-addresses-v8.81.sql`.
- wersja `8.78` — dodano projektowy `.npmrc`, wymuszenie publicznego rejestru npm w `prepare:deps` oraz test chroniący konfigurację i obecność pliku w ZIP-ie.
- wersja `8.68` — wyłącznie desktop administratora: osobny kolorowy status pewności dla producenta, modelu i numeru seryjnego; mobile bez OCR-u i bez zmian.
- wersja `8.67` — wyłącznie desktop administratora: spójne karty JZ/JW z modelem, numerem seryjnym, tabliczką i zapisanym statusem OCR.
- wersja `8.66` — wyłącznie desktop administratora: globalne wyszukiwanie po klientach, telefonach, adresach, modelach, numerach seryjnych, numerach zleceń i monterach, z bezpośrednim otwieraniem właściwego rekordu; mobile bez zmian.
- wersja `8.65` — wyłącznie desktop administratora: ręczny OCR zapisanych tabliczek JZ/JW, edycja wyniku przed zatwierdzeniem oraz zapis do montażu i modułu Urządzenia; mobile bez OCR.
- wersja `8.64` — wyłącznie mobile: trwała kolejka zdjęć w IndexedDB z automatycznym ponawianiem po odzyskaniu internetu, czytelne statusy `Zapisano na telefonie / Wysyłanie / Zapisano w systemie`, ręczny przycisk `Wyślij ponownie`, lokalna kontrola jakości tabliczki bez OCR oraz sekcje `Ostatnio używane` i `Najczęściej wybierane` nad pełnym katalogiem Rotenso.
- wersja `8.62` — naprawiono przesunięty kadr tabliczek na iPhonie oraz wyświetlanie całego zdjęcia w mobile i desktopie. Usunięto globalny styl `img`, który rozdzielał pozycję ramki od obrazu; dodano pomiar rzeczywistego prostokąta obrazu, tryb `contain` dla podglądów tabliczek oraz zachowanie jakości wykadrowanego pliku bez drugiej stratnej kompresji.
- wersja `8.61` — pełny bieżący katalog Rotenso w kreatorze mobilnym, wyszukiwarka modeli, kategorie i moce dopasowane do wybranej rodziny.
- wersja `8.60` — hotfix bazy dla montaży bez numerów seryjnych. Uruchom w Supabase SQL Editor plik `devices-empty-serial-hotfix-v8.60.sql`; pozwala on zapisywać wiele urządzeń z pustym numerem seryjnym, zachowując unikalność numerów faktycznie wpisanych. Aplikacja mobilna rozpoznaje ten błąd i podaje czytelną instrukcję zamiast surowego komunikatu PostgreSQL.
- wersja `8.59` — wyłącznie mobile: po wykonaniu zdjęcia tabliczki otwiera się ekran kadrowania; pracownik może przesunąć i zmienić ramkę, ponowić zdjęcie oraz zapisać tylko wykadrowaną tabliczkę. OCR pozostaje wyłączony.
- wersja `8.58` — wyłącznie mobile: przebudowano widok `Urządzenia i tabliczki` w szczegółach montażu. Każda jednostka JZ/JW ma teraz jeden pełnoszeroki wiersz z oznaczeniem, modelem i prostą akcją `Dodaj` lub `Otwórz`. Usunięto z listy duże pola tabliczek, przyciski usuwania i historyczny numer seryjny; dodano czytelny status kompletu tabliczek dla każdego urządzenia.
- wersja `8.45` — dodano blokadę skanowania `Xi` do pola `JZ` i `Xo` do pola `JW` oraz testowego klienta Multi-Split z trzema JW.
- wersja `8.44` — naprawiono pełny odczyt SN `540V4020005A6130130004` z trudnej fotografii `RO50Xi R14`, ustabilizowano małą ikonę i jasny modal skanera oraz dodano pracownikowi ograniczoną akcję `Numery seryjne`.
- wersja `8.43` — rozszerzono mobilny słownik kodów Rotenso o serie, których nie było na przekazanych zdjęciach, w tym Luve Pro Black. `I35Xo R14` jest rozpoznawane jako `Imoto 3,5 kW`, `R…` oznacza Roni, a `RO…` oznacza Revio. Parser zachowuje moc, wariant `Xi/Xo` i rewizję `Rxx` oraz odrzuca nieznane moce.
- wersja `8.38` — dodano skanowanie numerów seryjnych z tabliczki znamionowej aparatem w mobilnym formularzu montażu. Przycisk `Skanuj` działa przy jednostce zewnętrznej i każdej jednostce wewnętrznej single/multi-split. Zdjęcie jest analizowane lokalnie na telefonie przez OCR, bez przesyłania tabliczki do zewnętrznej usługi; pracownik widzi podgląd, postęp, możliwe wyniki oraz edytowalne pole z przypomnieniem o sprawdzeniu znaków `0/O`, `1/I` i `5/S`. Dodano rzeczywisty E2E na profilu iPhone 14, obejmujący OCR tabliczki oraz wpisanie numerów JW/JZ. Desktop pozostaje bez zmian.
- wersja `8.37` — pracownik widzi jakość połączenia oraz stan synchronizacji zdjęć; upload, ponowienie, odświeżenie i usunięcie aktualizują wskaźnik. Dodano mobilny E2E Playwright imitujący iPhone 14 i dwie osobne sesje pracownika/administratora, który automatycznie dodaje zdjęcie, potwierdza jego pojawienie się na drugim ekranie, usuwa je i potwierdza zniknięcie w obu sesjach. Mobilny numer wersji jest teraz podbijany i weryfikowany razem z wersją główną. Desktop pozostaje bez zmian.
- wersja `8.36` — techniczne zabezpieczenie wydań mobilnych: dodano osobny `release:mobile`, włączono komplet aktualnych testów zdjęć, naprawiono test prywatnych zdjęć, dodano kontrolę numeru wersji w `RELEASE-RESULT.md` i zapis finalnego raportu przed spakowaniem ZIP-a. Funkcje oraz wygląd aplikacji mobilnej i desktopowej pozostały bez zmian.
- wersja `8.35` — synchronizacja zdjęć między urządzeniami: realtime i awaryjny polling co 10 sekund wymuszają ciche przeładowanie otwartej karty montażu po zmianach w `photos`, `comments`, `job_access` i `jobs`, więc zdjęcie dodane/usunięte na telefonie powinno pojawić się albo zniknąć na desktopie i drugiej mobilce bez wylogowania.
- wersja `8.34` — hotfix mobilnych zdjęć: po udanym uploadzie miniatura nie znika z karty montażu; aplikacja zachowuje lokalny podgląd do czasu cichej synchronizacji z signed URL z Supabase i nie nadpisuje świeżych zdjęć pustym stanem cache.
- wersja `8.33` — mobilne zdjęcia: usunięto techniczny napis `zmniejszone o ...% przed wysłaniem` z karty zdjęcia po uploadzie; kompresja dalej działa w tle, ale pracownik widzi tylko potrzebne statusy wysyłki.
- wersja `8.32` — hotfix mobilnego uploadu zdjęć: aplikacja zapisuje `uploaded_by` na podstawie aktualnej sesji `auth.uid()`, a w paczce jest SQL `mobile-photo-upload-rls-v8.32.sql` do odtworzenia polityk RLS dla zdjęć, gdyby produkcyjna baza nadal blokowała zapis.
- wersja `8.31` — mobilna kompresja zdjęć przed uploadem: aplikacja zmniejsza zdjęcia do maksymalnie 1800 px na dłuższym boku, zapisuje JPG w jakości 78% i wysyła mniejszy plik przez istniejącą kolejkę zdjęć.
- wersja `8.30` — mobilna kolejka zdjęć: po dodaniu zdjęcia od razu widać lokalną miniaturę, wysyłka działa w tle ze statusem `wysyłanie / wysłano / błąd`, a nieudane zdjęcie można ponowić bez przeładowania całej karty.
- wersja `8.29` — przyspieszenie wersji mobilnej: lekkie odświeżanie listy, doczytywanie zdjęć/komentarzy tylko dla otwartej karty, natychmiastowe podświetlanie montera oraz szybsze lokalne wylogowanie.
- wersja `8.27` — desktop-only: zamrożono mobile, opisano strukturę projektu i ujednolicono desktopowy layout administratora w modułach Montaże, Kontrahenci i Urządzenia.
- wersja `8.26` — desktopowy formularz Montaże wykrywa istniejącego klienta po telefonie/e-mailu/nazwie i pokazuje okno decyzji: podłącz istniejącego klienta do montażu albo nadpisz jego kartotekę danymi z formularza; mobile bez zmian.
- wersja `8.20` — desktopowy prawy panel szczegółów montażu ma przyklejoną górną belkę, szybkie akcje, wyraźnie zaznaczony wiersz w tabeli oraz szczegóły uporządkowane w karty; mobile i baza bez zmian.
- wersja `8.19` — desktopowy moduł `Montaże` ma niezależne przewijanie lewej tabeli i prawego panelu szczegółów po kliknięciu klienta; mobile bez zmian.
- wersja `8.13` — poprawiono szerokość desktopowego modułu `Kalendarz`, żeby prawy panel `Wybrany dzień` oraz przycisk `Następny` nie wychodziły poza ekran i żeby było widać prawą krawędź oraz zaokrąglenie.
- wersja `8.12` — w Centrum 360 poszerzono kolumnę monterów w `Nadchodzących montażach`, żeby mieściły się 4 badge’e 32x32px w jednej linii; nagłówek modułu `Montaże` na desktopie został skrócony do wysokości paska Kalendarza.
- wersja `8.11` — poprawiono badge’e monterów w Centrum 360 tak, żeby globalny CSS nie zmniejszał ich do 24px; kółka są wymuszone na 32x32px jak w tabeli Montaże.
- wersja `8.09` — w `Centrum 360` wyrównano szerokość badge’y monterów w `Nadchodzących montażach` do szerokości badge’y statusów montaży.
- wersja `8.08` — uporządkowano desktopowe nagłówki modułów: usunięto opisy pod tytułami w `Montaże`, `Urządzenia`, `SMS` i `Szablony SMS`, bez zmiany `Kalendarza` i `Kontrahentów`.
- wersja `8.07` — poprawiono Centrum 360: `SMS do wysłania` liczy dokładnie tę samą kolejkę klientów co moduł SMS, a kafelek `Montaże 7 dni` zmieniono na `Montaże bieżący tydzień` liczony od poniedziałku do niedzieli.
- wersja `8.06` — techniczne wzmocnienie bezpieczeństwa i szybkości: zdjęcia montaży przechodzą na prywatny bucket `job-photos` z czasowymi signed URL, `Centrum 360` może używać centralnego RPC `admin_get_dashboard_metrics()`, szczegóły montażu ładują zdjęcia/komentarze dopiero po kliknięciu, a migracja dodaje indeksy pod najczęstsze widoki.
- wersja `8.04` — utwardzono zabezpieczenia: Edge Function `send-assignment-push` sprawdza teraz `installation_date` po stronie serwera i pomija push dla historycznych montaży, a polityki RLS dla kasowania montaży, zdjęć i powiadomień nie używają już szerokiego `using (true)`.
- wersja `8.02` — w desktopowym module `Montaże` poszerzono całą lewą tabelę oraz kolumnę `Klient` o około 1/3 względem wersji 8.01, bez zmiany szerokości kolumny `Status` i bez cofania szerszego panelu szczegółów.
- wersja `8.00` — w desktopowym module `Montaże` zwężono kolumnę `Klient`, zmniejszono minimalną szerokość listy i poszerzono prawy panel szczegółów.
- wersja `7.99` — w desktopowej tabeli `Montaże` usunięto osobną kolumnę `Adres`; adres jest teraz pokazany pod nazwą klienta w kolumnie `Klient`, dzięki czemu tabela jest węższa i czytelniejsza.
- wersja `7.98` — poprawiono `Centrum 360`: kafelek `SMS do wysłania` liczy teraz dokładnie kolejkę klientów z modułu SMS, a w `Nadchodzące montaże` usunięto niepotrzebną godzinę z lewego badge, zostawiając samą datę.
- wersja `7.96` — poprawiono `Centrum 360`: nazwa klienta jest brana z `client/title` albo z powiązanego kontrahenta, monterzy są pobierani z przypisań/profili, a z górnych kafelków usunięto `Urządzenia`, zostawiając `Montaże dziś`, `Montaże 7 dni` i `SMS do wysłania`.
- wersja `7.95` — dodano desktopowe `Centrum 360` jako pierwszy ekran administratora oraz przeprojektowano biały sidebar zgodnie z projektem referencyjnym: większe, czytelniejsze ikony liniowe, mocniejsza typografia, aktywny kafelek i oryginalne logo Wawis.
- wersja `7.57` — w module `Montaże` dodano paginację po 10 zleceń na stronę w widoku desktopowym i mobilnym, z przyciskami przechodzenia między stronami.
- wersja `7.56` — moduły administratora `SMS`, `Kontrahenci`, `Urządzenia` i `Kalendarz` są teraz ładowane lazy loadingiem, żeby zmniejszyć główny chunk startowy aplikacji.


## Kolorowa pewność OCR 8.68
- każde pole `Producent`, `Model` i `Numer seryjny` ma osobną ocenę,
- zielony: wysoka pewność,
- pomarańczowy: warto sprawdzić,
- czerwony: brak odczytu albo podejrzany wynik,
- procent i komunikat są liczone osobno na podstawie kilku przebiegów OCR, słownika modeli oraz kodu kreskowego, gdy jest dostępny,
- po ręcznej zmianie pole ma status pomarańczowy do czasu wizualnego sprawdzenia,
- wynik nie jest zapisywany automatycznie; administrator nadal używa przycisku zatwierdzenia,
- funkcja nie jest importowana do `src/mobile791`.

## Globalne wyszukiwanie desktopowe 8.66
- jedno pole wyszukiwania jest stale dostępne na górze desktopu administratora niezależnie od otwartego modułu,
- zakres obejmuje: nazwę klienta/kontrahenta, telefon, e-mail, ulicę, miasto, model, numer seryjny, identyfikator zlecenia i nazwisko montera,
- wyszukiwanie ignoruje wielkość liter, polskie znaki i separatory w telefonach/numerach seryjnych,
- wyniki są oznaczone jako `Montaż`, `Kontrahent` albo `Urządzenie`,
- kliknięcie montażu otwiera właściwą kartę i status, kliknięcie kontrahenta otwiera jego szczegóły, a kliknięcie urządzenia otwiera właściwy rekord w module `Urządzenia`,
- skrót `Ctrl+K` ustawia kursor w polu wyszukiwania,
- funkcja jest wyłącznie desktopowa i nie jest importowana do `src/mobile791`.

## Desktopowy OCR tabliczek 8.65
- OCR jest dostępny wyłącznie dla administratora w desktopowych szczegółach montażu. Mobilna wersja pracownika pozostaje bez OCR-u i nadal traktuje zdjęcie jako źródło prawdy.
- Przy fotografii zapisanej w folderze `nameplates` przycisk `Odczytaj OCR` otwiera podgląd zdjęcia i lokalną analizę Tesseract.
- Administrator zawsze zatwierdza wynik ręcznie. Może poprawić producenta, model i numer seryjny oraz zdecydować, czy zapisać model, numer, czy oba pola.
- Zapis jest kierowany do jednostki określonej w nazwie pliku: `device-N_jz` albo `device-N_jw-X`. Multi zachowuje osobne modele i numery dla `JW1`–`JW5`.
- Po zapisie aktualizowane są pola `jobs.device_model` i `jobs.device_serial_number`, a następnie uruchamiana jest istniejąca synchronizacja modułu `Urządzenia`.
- Runtime OCR znajduje się lokalnie w `public/ocr`; aplikacja nie korzysta z zewnętrznego API OCR i nie wymaga nowej migracji Supabase.

## Hotfix pustych numerów seryjnych 8.60
Jeżeli zapis montażu pokazuje błąd `duplicate key value violates unique constraint "devices_serial_number_key"`, nie jest to błąd zdjęcia ani kadrowania. Produkcyjna baza ma historyczny indeks, który traktuje pusty numer seryjny jak zwykłą unikalną wartość.

Jednorazowa naprawa:
1. Otwórz projekt w Supabase.
2. Wejdź w `SQL Editor` i utwórz nowe zapytanie.
3. Wklej całą zawartość pliku `devices-empty-serial-hotfix-v8.60.sql`.
4. Kliknij `Run`.
5. Wróć do aplikacji i zapisz montaż ponownie.

Skrypt nie usuwa ani nie zmienia istniejących numerów seryjnych. Pozwala tylko na wiele pustych wartości; rzeczywiście wpisane numery nadal są unikalne.

## Pełny katalog Rotenso w kreatorze mobilnym 8.61
- wybór modelu Rotenso ma wyszukiwarkę i kategorie: ścienne, konsolowe, kasetonowe, kanałowe, przypodłogowo-podsufitowe oraz agregaty Multi,
- lista obejmuje bieżące rodziny m.in. Luve Pro, Mirai, Fresh, Roni, Versu, Luve, Revio, Imoto, Teta, Ukura, Elis, Aneru, Tenji, Nevo, Jato oraz Hiro N/S/HP,
- po wyborze modelu aplikacja ogranicza pole `Moc` do wariantów dostępnych dla wybranej rodziny,
- w trybie Multi dla JZ menu pokazuje agregaty Hiro N, Hiro S i Hiro HP, a dla JW pełny katalog jednostek wewnętrznych,
- pozycje `Inny model` i `Inna moc` pozostają dostępne dla urządzeń archiwalnych lub nietypowych.

## Cel aplikacji
- ekran logowania rozdziela dostęp dla pracownika i administratora
- desktopowy sidebar administratora pokazuje stały napis `Wersja {APP_VERSION}` nad kartą profilu, żeby numer aktualnej wersji był widoczny przez cały czas pracy
- `Montaże` są podstawowym modułem pracy dla obu ról
- `Centrum 360`, `SMS`, `Kontrahenci`, `Urządzenia` i `Kalendarz` są modułami tylko dla administratora

## Moduły i role
### Pracownik
- Pracownik: tylko telefon — konto pracownika działa wyłącznie na telefonie w widoku mobilnym.
- na desktopie oraz urządzeniach tabletowych/podobnych do desktopu pracownik widzi blokadę z informacją, że moduł pracownika jest tylko na telefonie.
- dostęp do modułu `Montaże`.
- na niezakończonej karcie montażu przycisk `Tabliczki` otwiera ograniczony formularz dokumentacji JZ/JW; dane klienta, komentarz administratora i przypisania pozostają poza edycją pracownika.
- do JZ i każdej JW przypisujemy osobne zdjęcie tabliczki znamionowej. OCR nie jest używany, więc aplikacja nie zgaduje modelu ani numeru seryjnego.
- model i numer seryjny pozostają opcjonalne. W szczegółach każda jednostka ma kompaktową pozycję `Tabliczka znamionowa`; fotografia otwiera się dopiero po kliknięciu, a istniejące dane tekstowe są pokazane dyskretnie pod pozycją.
- model i numer seryjny każdej JW są przechowywane nierozłącznie; przykładowo pusty numer JW1 nie może spowodować przesunięcia numeru JW2 do JW1.
- brak dostępu do modułów `SMS`, `Kontrahenci`, `Urządzenia` i `Kalendarz`.
- nie zmieniamy zachowania modułów administratora na koncie pracownika.

### Administrator
- Administrator: desktop i telefon — konto administratora działa na desktopie oraz na telefonie.
- na desktopie administrator korzysta z `AdminDesktopShell` i bocznego menu; sidebar pozostaje biały, zachowuje oryginalne logo Wawis, ma większe profesjonalne ikony liniowe, mocniejszą typografię i bez zdublowanych pozycji `Ustawienia`/`Użytkownicy`.
- na telefonie administrator korzysta z mobilnego układu i przełącznika modułów.
- dostęp do `Centrum 360`, `Montaże`, `Kalendarz`, `SMS`, `Kontrahenci`, `Urządzenia`.
- kod wycofanego modułu `Serwisy` został usunięty; proces serwisowy obsługują obecne moduły `Urządzenia` i `SMS`, a test `test:smoke:no-services-module` pilnuje, żeby martwy moduł nie wrócił.
- zarządza bazą kontrahentów, urządzeniami i kolejką SMS.
- na desktopie może opcjonalnie uruchomić OCR zapisanej tabliczki, poprawić wynik i zatwierdzić model/numer do bazy; funkcja nie jest dostępna w mobile.

## Zasady pracy nad projektem
- po każdej zmianie aktualizujemy `README.md` i `CHANGELOG.md`
- każda nowa tabela Supabase w schemacie `public` musi dostać jawny `GRANT` dla właściwej roli API (`authenticated` i/lub `service_role`) oraz `alter table ... enable row level security`; bez tego nie wypuszczamy ZIP-a
- `test:smoke:supabase-grants` skanuje pliki SQL i blokuje release, jeżeli `create table` nie ma jawnego `GRANT` lub RLS
- `supabase/migrations/archive/supabase-grants-audit-wawis.sql` służy do ręcznego audytu produkcyjnej bazy w Supabase SQL Editor; sekcja A jest tylko do odczytu, a poprawki uruchamiamy świadomie
- po każdej wersji tworzymy ZIP z całym projektem przez `npm run zip:release`
- przed buildem pilnujemy czystej i powtarzalnej instalacji zależności przez `npm run prepare:deps`
- przed wydaniem robimy podwójne sprawdzenie smoke, verify i build
- po release runnerze zapisujemy wynik w `RELEASE-RESULT.md`: smoke x2, verify x2, build x2, `verify:bundle` x2 i ZIP OK; `verify:release` blokuje wydanie, gdy numer raportu różni się od numeru aplikacji
- przy zmianach desktopowych uruchamiamy `test:smoke:desktop-only`, żeby nie wypuścić przypadkowej zmiany widoku mobilnego
- `test:smoke:calendar-sidebar` pilnuje, że kalendarz nie używa już daty utworzenia zlecenia jako terminu montażu
- skrócona procedura wydania jest w `RELEASE-CHECKLIST.md`
- `npm run release` uruchamia pełny flow wydania przez `scripts/run-release.cjs`; `npm run release:mobile` uruchamia mobilny flow ze wszystkimi testami zdjęć, a `npm run release:mobile:dry-run` pokazuje jego plan; osobno pozostają `release:desktop`, `release:desktop:dry-run` i `release:desktop:sandbox` bez `npm run build` w sandboxie
- GitHub Actions w `.github/workflows/desktop-release-checks.yml` uruchamia `npm run release:desktop -- --skip-version-bump`, żeby CI sprawdzało ten sam zestaw smoke/verify/build/ZIP co lokalny desktopowy runner
- GitHub Actions w `.github/workflows/mobile-release-checks.yml` uruchamia `npm run release:mobile -- --skip-version-bump`; publiczny npm, Playwright, wszystkie testy x2, build x2, raport i kontrola ZIP-a muszą przejść, aby wersja dostała status `ZIELONY`; dowolny błąd daje `CZERWONY`
- po każdej zakończonej wersji przygotowujemy propozycje kolejnych ulepszeń
- przy pracach nad `SMS`, `Kontrahenci`, `Urządzenia` nic nie zmieniamy dla pracownika, tylko w koncie administratora
- `test:smoke:device-save` pilnuje zapisu wielu urządzeń z formularza montażu jako uporządkowanych zestawów: model + numer seryjny JW + numer seryjny JZ
- `test:smoke:job-multi-indoor` pilnuje systemów multi-split: jedna jednostka zewnętrzna i do 5 jednostek wewnętrznych w ramach tego samego urządzenia
- `test:smoke:job-device-type-switch` pilnuje przełącznika `Single-split / Multi-split`, zachowania pustych pól JW w formularzu multi oraz zapisu bez pustych numerów seryjnych
- `test:smoke:job-device-spaces` pilnuje, że w formularzu dodawania i edycji montażu pola `Model urządzenia`, `Numer seryjny jednostki wewnętrznej` i `Numer seryjny jednostki zewnętrznej` pozwalają wpisywać spacje podczas edycji, a zapis końcowy tylko porządkuje brzegi wartości.
- `test:smoke:device-delete` pilnuje przycisku `Usuń`, modalu potwierdzenia i dwóch ścieżek usuwania urządzeń: rekord `devices` oraz urządzenie zapisane w montażu
- `test:smoke:assignment-push` pilnuje, że historyczny montaż nie wysyła pusha do instalatorów przy dodawaniu/edycji przypisania, a dzisiejsze i przyszłe montaże zachowują dotychczasowe powiadomienia
- `test:smoke:supabase-transient` pilnuje komunikatu dla `500/502/503/504` i timeoutów, zachowania lokalnej sesji podczas awarii oraz wylogowania dopiero po rzeczywistym `SIGNED_OUT`
- `test:smoke:desktop-device-wizard-polish` pilnuje szerokości 540 px, pełnego wypełnienia modalu bez bocznych pasów, neutralnej grafitowej akcji `Zapisz urządzenia` oraz braku zmian wizualnych w mobile
- `test:smoke:photo-preview-gallery-separation` pilnuje, że strzałki zwykłych zdjęć nie przechodzą do tabliczek, a podgląd tabliczek pozostaje w osobnej galerii na desktopie i mobile
- `test:smoke:source-job-id-hotfix` pilnuje hotfixa `devices.source_job_id` typu `text`, triggerów wielu urządzeń, odtworzenia funkcji raportujących przez `DROP FUNCTION` i przyjaznego komunikatu przy błędzie uuid/text z Supabase
- `test:smoke:supabase-grants` pilnuje SQL-i Supabase: każda nowa tabela `public` utworzona przez `create table` musi mieć jawny `GRANT` dla roli API oraz `alter table ... enable row level security`
- `test:smoke:center360-installer-width` pilnuje, że w `Centrum 360` poszerzona kolumna monterów mieści 4 okrągłe badge’e 32x32px w jednej linii.
- `test:smoke:center360` pilnuje, że Centrum 360 nie pokazuje fałszywego `Klient bez nazwy` przy znanym kliencie/kontrahencie, uwzględnia monterów z przypisań, nie przywraca kafelka `Urządzenia`, pokazuje monterów jako okrągłe badge inicjałów, używa tych samych klas statusów co moduł `Montaże`, pilnuje poszerzonej kolumny monterów na 4 badge’e w jednej linii w `Nadchodzących montażach` oraz liczy `Kontrahenci w bazie`, `Zlecenia bez montera`, `SMS do wysłania` i `Montaże bieżący tydzień` zgodnie z aktualnymi zasadami modułów.
- `test:smoke:desktop-jobs-client-address` pilnuje desktopowej tabeli `Montaże`: brak osobnej kolumny `Adres`, adres pod nazwą klienta oraz pionowy układ komórki klienta.
- `test:smoke:desktop-jobs-layout-width` pilnuje wersji desktopowej `Montaże`: zwężonej kolumny klienta, mniejszej minimalnej szerokości tabeli i szerszego panelu szczegółów klienta po prawej stronie.
- `test:smoke:desktop-job-details-polish` pilnuje desktopowego panelu szczegółów montażu: przyklejonej belki, szybkich akcji, kart/sekcji i wyraźnego zaznaczenia wybranego wiersza.
- `test:smoke:desktop-module-headers` pilnuje, że desktopowe nagłówki `Montaże`, `Urządzenia`, `SMS` i `Szablony SMS` nie przywrócą opisów pod tytułami oraz że nagłówek `Montaże` pozostaje kompaktowy jak pasek `Kalendarza`.
- `test:smoke:no-services-module` pilnuje, że osobny moduł `Serwisy`, stare panele 360 oraz martwe zapowiedzi serwisowe nie wrócą do UI/kodu aplikacji.


## Zasady pracy z ChatGPT
- Pracujemy nad ustalonym zakresem, bez lunatykowania i bez dopisywania funkcji poza zleceniem.
- Każda zakończona zmiana podbija wersję o jeden krok na końcu, np. `7.87 -> 7.88`.
- Po każdej zmianie aktualizujemy `README.md` oraz `CHANGELOG.md`.
- Każda nowa tabela Supabase w `public` dostaje od razu jawny `GRANT` i RLS; tego pilnuje `test:smoke:supabase-grants`, więc nie trzeba o tym przypominać przy kolejnych ZIP-ach.
- Po każdej wersji tworzymy ZIP z całym projektem przez `npm run zip:release`.
- Release ZIP nie może zawierać starych katalogów `logs*`, plików `.log`, `.tmp`, cache, coverage ani katalogów roboczych.
- W sandboxie nie uruchamiamy `npm run build`; używamy `npm run release:desktop:sandbox`, gdzie build i `verify:bundle` są jawnie wpisane jako pominięte.
- Przed wydaniem robimy podwójne smoke x2 i verify x2; poza sandboxiem również build x2 i `verify:bundle` x2.
- W bieżącym zakresie pracujemy tylko nad wersją mobilną; desktop pozostaje zamrożony. Nadal pilnujemy polityki ról: Pracownik tylko telefon, Administrator desktop i telefon.
- Na koniec każdej wersji przygotowujemy propozycje kolejnych ulepszeń.

## Architektura wysokiego poziomu
- `src/App.jsx` — główny shell aplikacji, routing modułów i guardy ról
- `src/components/AuthScreen.jsx` — ekran logowania i rejestracji
- `src/components/JobsPanel.jsx` + `src/components/JobDetailsPanel.jsx` — główny moduł montaży
- `src/components/jobs/JobsPagination.jsx` — wspólna paginacja listy montaży dla desktopu i mobile
- `src/components/dashboard/Centrum360Panel.jsx` — desktopowe centrum dowodzenia administratora z kafelkami, wykresem tygodnia, statusem zleceń i szybkimi filtrami; nazwy klientów i monterów pobiera z danych zleceń, kontrahentów oraz profili
- `src/components/sms/SmsPanel.jsx` — moduł SMS dla administratora
- `src/components/contractors/ContractorsPanel.jsx` — baza kontrahentów dla administratora
- `src/components/devices/DevicesPanel.jsx` — katalog urządzeń dla administratora
- `src/components/calendar/CalendarPanel.jsx` — kalendarz montaży dla administratora; pokazuje tylko zlecenia z ustawioną `installation_date`, a kliknięcie wpisu z panelu `Wybrany dzień` otwiera konkretny montaż w module `Zlecenia`
- `src/hooks/useAppSession.js` — sesja, profil i odświeżanie danych
- `src/hooks/useSelectedJobActions.js` — akcje na wybranym montażu
- `src/modules/*` — logika domenowa wydzielona z komponentów
- `src/modules/job-devices.js` — normalizacja wielu urządzeń w jednym montażu, obsługa numerów seryjnych JW/JZ, typów `single-split`/`multi-split`, systemów multi-split z wieloma jednostkami wewnętrznymi, wpisywania spacji w modelach i numerach podczas edycji oraz bezpieczne mapowanie na istniejące pola `device_model` i `device_serial_number` bez wymuszonej migracji starych montaży
- `src/modules/jobs-assignment.js` — logika przypisywania instalatorów i blokada pushy dla montaży z datą wcześniejszą niż dzisiejsza
- `src/lib/mockSupabaseClient.js` — testowy klient Supabase dla E2E desktopowego bez dotykania produkcyjnej bazy; zawiera też scenariusze cudzych i zakończonych montaży do kontroli uprawnień pracownika

## Wydajność
- moduły administratora `SMS`, `Kontrahenci`, `Urządzenia` i `Kalendarz` są ładowane lazy loadingiem
- widoki `MobileJobsLayout` i `DesktopJobsLayout` w `JobsPanel` też są ładowane lazy, więc start aplikacji nie bierze od razu obu layoutów
- moduł `Montaże` wyświetla maksymalnie 10 zleceń na stronę w desktopie i mobile, żeby długie listy nie ciągnęły się w jednym widoku
- import i eksport XLSX w modułach administratora są dociągane dynamicznie dopiero przy akcji użytkownika
- `JobDetailsPanel` ładuje się lazy dopiero po wybraniu montażu, więc start aplikacji nie niesie całego panelu szczegółów
- `JobFormModal` ładuje się lazy dopiero przy dodawaniu lub edycji montażu, więc cięższy formularz nie siedzi już w kodzie startowym
- eksporty modułu `Montaże` są rozbite na osobne pliki dynamiczne dla Excel i PDF, żeby łatwiej utrzymać lekki kod startowy przy dalszej integracji panelu eksportu
- `vite.config.js` rozdziela `vendor-react` i `vendor-supabase`, żeby główny chunk `index-*.js` nie rósł razem z bibliotekami bazowymi
- moduł powiadomień push jest dociągany dynamicznie w `usePushNotificationsState`, więc kod push nie trafia do ścieżki startowej logowania i pierwszego wejścia w desktop
- `npm run verify:bundle` sprawdza po buildzie, czy główny chunk `index-*.js` nie przekracza budżetu 320 KB oraz czy powstały chunki `vendor-react` i `vendor-supabase`
- paczka `ZIP` powstaje z jawnej listy plików, bez `zip -r`; nie zawiera `node_modules`, `dist`, `releases`, katalogu roboczego `supabase/.temp`, katalogów `logs*`, plików `.log`, `.tmp`, cache/coverage, roboczych plików `README-SMS-STAGE-*` ani `README-START.txt`, więc release jest czystszy i bezpieczniejszy do wdrożeń
- `verify:release` blokuje częściowy katalog `dist` po nieudanym buildzie, czyli `dist` bez `index.html` albo bez plików w `dist/assets`
- moduł SMS uruchamia bezpieczne czyszczenie starych duplikatów logów przez RPC `admin_cleanup_sms_duplicate_logs`; duplikaty po urządzeniach z jednego montażu i po kilku zleceniach tego samego klienta w tym samym terminie serwisu są scalane do jednej pozycji SMS
- moduł `Kalendarz` w desktopie ma zdjęty wrapper `.page`, a nadrzędny grid `twoColDesktopStatusLeft.singleModuleColumn` wymusza jedną pełną kolumnę bez pustej kolumny `420px`; hero, toolbar i siatka z panelem `Wybrany dzień` dochodzą do prawej strony obszaru roboczego
- panel `Wybrany dzień` w kalendarzu pokazuje status, model urządzenia i adres bez otwierania szczegółów montażu
- kratki dni w kalendarzu są lekko wyższe niż w wersji 7.72, żeby lepiej wykorzystać wolne miejsce na dole ekranu i poprawić czytelność wpisów

## Testy i kontrola jakości
### Smoke
- `npm run test:smoke` — smoke logowania i pierwszego odświeżenia danych
- `npm run test:smoke:admin-worker` — smoke guardów ról `pracownik/admin` oraz blokad RPC dla modułów administratora
- `npm run test:smoke:admin-worker` — alias smoke ścieżki `administrator kontra pracownik`, żeby release miał czytelny test pod wymaganie ról
- `npm run test:smoke:job-multi-indoor` — smoke zapisu systemów multi-split: jeden model i jedna jednostka zewnętrzna z maksymalnie 5 numerami jednostek wewnętrznych
- `npm run test:smoke:job-device-type-switch` — smoke przełącznika `Single-split / Multi-split`: tryb multi utrzymuje kilka pustych pól JW w formularzu, a zapis usuwa puste numery i zachowuje strukturalne `JW1/JW2/JZ`
- `npm run test:smoke:version` — smoke zgodności wersji w `app-version.json`, `package.json`, `src/version.js` oraz widocznej wersji na ekranie logowania i w widokach mobile/desktop
- `npm run test:smoke:delete` — smoke ścieżki usuwania montażu: przycisku, potwierdzenia i samego wywołania kasowania rekordu `jobs`
- `npm run test:smoke:device-save` — smoke ścieżki zapisu jednego lub wielu zestawów `model urządzenia + numer seryjny JW + numer seryjny JZ` przy dodawaniu i edycji montażu oraz zachowania starego pojedynczego numeru seryjnego
- `npm run test:smoke:device-client-fallback` — smoke awaryjnego połączenia urządzenia z montażem, gdy klient albo źródłowy montaż nie są dostępne wprost
- `npm run test:smoke:job-contractor-link` — smoke powiązania montażu z kontrahentem i przejścia do danych kontrahenta
- `npm run test:smoke:job-auto-contractor` — smoke automatycznego tworzenia kontrahenta z nowego zlecenia oraz awaryjnego pokazywania klientów z montaży w panelu `Kontrahenci`
- `npm run test:smoke:assignment-push` — smoke blokady push o przypisaniu instalatora: montaż z datą sprzed dzisiaj nie wysyła pusha przy dodaniu/edycji/toggle instalatora, a montaż dzisiejszy lub przyszły nadal wysyła push.
- `npm run test:smoke:supabase-transient` — smoke rozróżnienia przeciążenia Supabase od błędów autoryzacji oraz zachowania sesji przy `500/504`.
- `npm run test:smoke:source-job-id-hotfix` — smoke hotfixa `devices.source_job_id`: pilnuje migracji typu `text`, `ROLLBACK` po przerwanym SQL, `DROP FUNCTION` dla funkcji z typami `OUT/TABLE`, triggerów wielu urządzeń z `id_montażu::device-N` oraz przyjaznego komunikatu zamiast surowego błędu uuid/text z Supabase.
- `npm run test:smoke:empty-device-serial` — sprawdza migrację dopuszczającą wiele pustych numerów seryjnych oraz przyjazny komunikat mobilny.
- `npm run test:smoke:supabase-grants` — smoke SQL-i Supabase; skanuje `create table` w plikach `.sql` i wymaga jawnego `GRANT` oraz RLS dla każdej nowej tabeli w `public`.
- `npm run test:smoke:sms-summary` — smoke logiki `getSmsSummary()` oraz widocznych kart podsumowania SMS w panelu administratora: `Klienci na liście` i `Wysłane w tym miesiącu`; test pilnuje też, że oba kafelki przełączają aktywny widok modułu SMS i że kafelek `Do przypomnienia dziś` nie wraca już do UI
- `npm run test:smoke:sms-job-grouping` — smoke grupowania SMS; pilnuje, że dwa lub trzy urządzenia z jednego montażu oraz kilka zleceń tego samego klienta z tym samym terminem serwisu tworzą jeden wpis kolejki i po wysłaniu jednego SMS-a duplikaty nie wracają na listę.
- `npm run test:smoke:sms-log-cleanup` — smoke czyszczenia historycznych duplikatów `sms_log`; pilnuje SQL `admin_cleanup_sms_duplicate_logs`, automatycznego wywołania cleanupu przed snapshotem/odświeżeniem kolejki i obecności testu w release flow.
- `npm run test:smoke:desktop-refresh` — smoke desktopowego shellu administratora i wiernego layoutu 1:1 modułu `SMS`; pilnuje obecności lewego sidebaru, górnego paska użytkownika, dużych kafelków, rozbudowanych filtrów i nowej tabeli desktopowej
- `npm run test:smoke:desktop-only` — smoke dla wersji desktopowej; pilnuje, że desktopowy release nie zmienił pliku `MobileJobsLayout.jsx`, że desktop i mobile nadal są rozdzielone lazy loadingiem oraz że bazowe hooki CSS widoku mobilnego nadal istnieją
- `npm run test:smoke:release-runner` — smoke planu `scripts/run-release.cjs`; sprawdza kolejność i kompletność komend pełnego, mobilnego i desktopowego release, w tym mobilne testy zdjęć oraz wariant `desktop-sandbox`
- `npm run test:smoke:windows-npm-runner` — smoke uruchamiania npm przez `prepare:deps`; sprawdza na Windows pierwszeństwo `npm_execpath` oraz awaryjne `npm.cmd`, aby błąd `spawnSync npm ENOENT` nie wrócił
- `npm run test:smoke:release-zip` — smoke `scripts/release-zip.cjs`; tworzy tymczasowy katalog z fałszywym `node_modules`, częściowym `dist` i plikami roboczymi, a potem sprawdza, że finalny ZIP ich nie zawiera
- `npm run test:smoke:release-zip-clean` — smoke czystości release ZIP; tworzy fałszywe katalogi `logs*`, `.cache`, `coverage`, `tmp`, `temp` oraz pliki `.log`, `.tmp`, `.swp` i sprawdza, że nie trafiają ani na listę release, ani do ZIP-a
- `npm run test:smoke:sidebar-settings` — smoke nawigacji bocznego menu do `Szablony SMS` i `Ustawienia`; pilnuje, że oba wpisy otwierają kartę ustawień z treścią szablonu SMS
- `npm run test:smoke:calendar-sidebar` — smoke modułu `Kalendarz`, wejścia z bocznego menu, logo WAWIS, przejścia z wpisu `Wybrany dzień` do konkretnego montażu, przycisku `Wróć do kalendarza`, dodatkowych danych w panelu dnia oraz blokady fallbacku z daty utworzenia dla montaży bez daty montażu
- `npm run test:smoke:calendar-width` — smoke pełnej szerokości desktopowego layoutu `Kalendarz`; pilnuje zdjęcia limitu szerokości strony, klas rozszerzających toolbar/siatkę, usunięcia górnego hero oraz override, który usuwa pustą prawą kolumnę `420px` z nadrzędnego grida
- `npm run test:smoke:e2e-desktop` — smoke okablowania rzeczywistych testów Playwright i trybu `VITE_SUPABASE_MODE=mock`
- `npm run test:smoke:startup-chunk` — smoke rozdzielenia vendorów React/Supabase, dynamicznego importu push i obecności `verify:bundle` w release flow
- `npm run test:smoke:regex-compat` — smoke zgodności najwrażliwszych regexów smoke z oboma stylami cudzysłowów, żeby stare testy nie blokowały release przez sam zapis stringów w kodzie
- `npm run test:smoke:mobile-private-photos` — sprawdza mobilny prywatny bucket, signed URL oraz bezpośrednie przekazanie konfiguracji zdjęć do `loadJobDetailsData`.
- `npm run test:smoke:mobile-photo-visibility-sync` — sprawdza, że świeżo wysłana miniatura nie znika przed synchronizacją z Supabase.
- `npm run test:smoke:photo-cross-device-sync` — sprawdza odświeżanie zdjęć po uploadzie, usunięciu, realtime i awaryjnym pollingu między telefonami oraz desktopem.
- `npm run test:smoke:mobile-photo-sync-indicator` — pilnuje wskaźnika jakości połączenia oraz stanów synchronizacji uploadu, ponowienia, odświeżenia i usunięcia.
- `npm run test:smoke:e2e-mobile` — sprawdza kompletność runnera, profilu iPhone 14, dwóch sesji i scenariusza dodaj/pokaż/usuń.
- `npm run test:e2e:mobile` — uruchamia rzeczywisty test Playwright na ekranie iPhone 14: pracownik dodaje zdjęcie, administrator widzi je w drugiej sesji, a usunięcie znika w obu sesjach; dodatkowo testuje klienta Multi-Split z trzema JW, trzy osobne modele JW i dodanie zdjęcia do tej realizacji.
- `npm run test:smoke:mobile-serial-scanner` — nazwa skryptu pozostaje dla zgodności release, ale test sprawdza dokumentację tabliczek bez OCR: natywny aparat i galerię, osobne zdjęcia JZ/JW, kompaktowy podgląd na żądanie, blokadę zakończenia bez kompletu oraz nierozłączne parowanie modelu i numeru JW.
- `npm run test:smoke:mobile-protocol` — sprawdza, że protokół pojawia się wyłącznie po zakończeniu zlecenia, zapisuje się prywatnie w Supabase, można go później pobrać lub przekazać do e-maila, nie zawiera numerów seryjnych i powstaje jako rzeczywisty jednostronicowy PDF z polskimi znakami.
- `npm run test:smoke:mobile-protocol-save` — symuluje zawieszony zapis protokołu, sprawdza limit 45 sekund, odblokowanie ekranu, diagnostykę `protocol.save.timeout` i brak dodatkowego odczytu po udanym zapisie.
- `npm run test:smoke:desktop-nameplate-ocr` — sprawdza lokalne zasoby OCR, przycisk dostępny wyłącznie administratorowi na desktopie, parser tabliczki, zapis do właściwej JZ/JW oraz brak akcji OCR w źródłach mobilnych.
- `npm run test:smoke:desktop-global-search` — sprawdza wyszukiwanie po kliencie, telefonie, adresie, modelu, numerze seryjnym, numerze zlecenia i monterze, nawigację do rekordów oraz brak komponentu w aplikacji mobilnej.
- mobilny `test:e2e:mobile` na profilu iPhone 14 sprawdza dokumentację JZ/JW, synchronizację dwóch sesji, trwałość zdjęcia offline po przeładowaniu, automatyczne wysłanie po odzyskaniu internetu oraz ukrywanie pustej sekcji komentarzy na zakończonym zleceniu.

### Źródła słownika Rotenso

- wykaz aktualnych serii i plików producenta: `https://rotenso.com/pl/do-pobrania/`
- aktualny wykaz rodzin pokojowych, komercyjnych i Multi-Split: `https://rotenso.com/en/air-conditioners/`
- karta producenta Hiro S potwierdzająca `H50Xm3 = Hiro S 5,3 kW`: `https://rotenso.com/pl/produkt/hiro-s/`
- karty dystrybutora producenta potwierdzające `HHP50Xm2/HHP70Xm3` jako Hiro HP oraz `UO…Xo` jako Unico
- kody rodzin są potwierdzane kartami katalogowymi producenta; w aplikacji nie dodajemy niepotwierdzonego prefiksu tylko na podstawie podobnej nazwy
- agregaty wspólne dla kilku wariantów, np. `LOP`, `VO`, `TO` lub `EO`, są opisywane bezpieczną nazwą rodziny, ponieważ sam kod jednostki zewnętrznej nie zawsze rozróżnia kolor albo panel jednostki wewnętrznej
- `npm run test:smoke:lazy` — smoke lazy loadingu modułów, przełączania widoków i dynamicznego ładowania XLSX
- `npm run test:smoke:suspense` — smoke fallbacków `Suspense` dla modułów administratora, widoków `Montaże`, panelu szczegółów i formularza montażu
- `npm run test:smoke:selection` — smoke ścieżki wyboru montażu, przekazania `selectedJob`, renderowania `JobDetailsPanel`, daty montażu oraz paginacji listy montaży po 10 zleceń na stronę w desktopie i mobile

### Verify
- `npm run verify:release` — kontrola wersji w kodzie, dokumentacji, changelogu i `RELEASE-RESULT.md`
- `npm run verify:bundle` — kontrola po buildzie: główny chunk startowy maksymalnie 320 KB oraz osobne chunki `vendor-react` i `vendor-supabase`

### E2E desktopu
- `npm run test:e2e:desktop` — prawdziwe testy Playwright na desktopie: logowanie administratora, wejście w `Montaże`, `Kalendarz`, `SMS`, logowanie pracownika i sprawdzenie braku modułów administratora
- testy Playwright używają `VITE_SUPABASE_MODE=mock`, danych `admin@wawis.test` / `pracownik@wawis.test` i klienta `src/lib/mockSupabaseClient.js`, więc nie dotykają produkcyjnej bazy Supabase
- zależność `@playwright/test` jest wpisana w `package.json`; przed pierwszym pełnym uruchomieniem E2E w nowym środowisku wykonaj `npm install`, a potem `npx playwright install chromium`

### Release runner
- `npm run release` — pełny flow wydania uruchamiany przez `scripts/run-release.cjs` zamiast długiej komendy w `package.json`; listę komend można podejrzeć przez `node scripts/run-release.cjs full --dry-run`
- `npm run release:mobile` — mobilny flow wydania: podbicie wersji, komplet mobilnych smoke testów x2 (w tym realtime, prywatne zdjęcia, kompresja, RLS, widoczność miniatur i synchronizacja między urządzeniami), verify x2, build x2, `verify:bundle` x2, finalny raport, ZIP oraz kontrola ZIP-a.
- `npm run release:mobile:dry-run` — pokazuje pełny plan mobilnego wydania bez uruchamiania testów, buildów i pakowania.
- `.github/workflows/mobile-release-checks.yml` — automatycznie wykonuje pełny `release:mobile` w GitHub Actions bez podbijania wersji; wynik zadania jest wymaganym zielonym/czerwonym potwierdzeniem przed publikacją.
- `npm run release:desktop` — desktopowy flow wydania: podbicie wersji, smoke desktopowe x2 razem z testami RLS, Centrum 360, tabliczek OCR/AI, `test:smoke:e2e-desktop`, prawdziwym `test:e2e:desktop` i `test:smoke:startup-chunk`, verify x2, build x2, `verify:bundle` x2, ZIP, verify ZIP i zapis `RELEASE-RESULT.md`.
- `npm run release:desktop:dry-run` — krótki alias do podejrzenia desktopowego planu bez uruchamiania smoke, verify, build ani ZIP

### Build
- `npm run prepare:deps` — sprawdza krytyczne zależności builda i w razie braków uruchamia czyste `npm ci --include=optional`, a następnie doinstalowuje brakujące natywne paczki z `package-lock.json`; na Windows używa `npm_execpath` bieżącego `npm.cmd`, a awaryjnie uruchamia `npm.cmd`
- `npm run build` — produkcyjny build aplikacji; skrypt sam wywołuje `prepare:deps` przed uruchomieniem Vite

Windows PowerShell, tryb testowy bez produkcyjnego Supabase:

```powershell
$env:VITE_SUPABASE_MODE="mock"
npm.cmd run build
npm.cmd run preview -- --host 0.0.0.0
```

Po komunikacie Vite otwórz podany adres lokalny. Do testu na iPhonie w tej samej sieci Wi‑Fi użyj adresu `http://ADRES-IP-KOMPUTERA:4173`.

### ZIP
- `npm run zip:release` — tworzy paczkę release w katalogu `releases/` z jawnej listy plików, bez rekurencyjnego `zip -r`

## Checklist release
Pełna, krótka procedura wydania jest w `RELEASE-CHECKLIST.md`. Dla zmian mobilnych uruchamiamy całość poleceniem `npm run release:mobile`.

Minimum dla każdej wersji:
1. Podbij wersję i uzupełnij `README.md` oraz `CHANGELOG.md`; automatyczny flow robi to przez `npm run version:bump`.
2. Uruchom wszystkie smoke testy z checklisty dwa razy; dla zmian mobilnych użyj `npm run release:mobile`, który obejmuje komplet aktualnych testów zdjęć i wspólne zabezpieczenia danych.
3. Uruchom `npm run verify:release` dwa razy.
4. Uruchom `npm run build` dwa razy.
5. Utwórz ZIP przez `npm run zip:release`.
6. Sprawdź ZIP przez `node scripts/verify-release.cjs --require-zip`.

## Synchronizacja katalogu urządzeń z montażami
- od wersji 7.83 nowe urządzenie w montażu ma trzy pola: `model`, numer seryjny jednostki wewnętrznej `JW` i numer seryjny jednostki zewnętrznej `JZ`; dane nadal zapisują się w istniejących polach `jobs.device_model` i `jobs.device_serial_number`, więc stare montaże nie są przerabiane automatycznie
- plik `supabase/migrations/archive/devices-module-stage-6-multi-job-devices.sql` aktualizuje synchronizację Supabase tak, żeby wiele urządzeń z jednego montażu trafiało do katalogu `devices` jako osobne rekordy powiązane z tym samym kontrahentem przez `contractor_id`
- pierwszy rekord urządzenia zachowuje `source_job_id = id montażu`, a kolejne dostają `source_job_id` w formacie `id_montażu::device-2`, `id_montażu::device-3` itd.; dzięki temu można je edytować i usuwać pojedynczo bez kasowania całego montażu
- plik `supabase/migrations/archive/devices-module-stage-7-source-job-id-text-production-hotfix.sql` naprawia produkcyjną bazę, w której `devices.source_job_id` zostało jako `uuid`; po hotfixie kolumna ma typ `text`, a trigger obsługuje wiele urządzeń z jednego montażu.
- stare montaże z dawnym pojedynczym numerem seryjnym są wyświetlane jako `Stary zapis numeru seryjnego` i zostają zapisane bez zmian, jeśli nie wpiszesz nowych numerów JW/JZ


## Supabase: jawne GRANT dla nowych tabel
- Od wersji `7.92` zasada jest zapisana w projekcie: każda nowa tabela w `public` tworzona w SQL/migracji musi mieć jawny `GRANT` dla właściwej roli Data API oraz włączone RLS.
- Dla zwykłych tabel aplikacji po logowaniu stosujemy najczęściej `grant select, insert, update, delete on table public.nazwa_tabeli to authenticated, service_role;`.
- Dla tabel technicznych, np. SMS/log/audyt obsługiwanych przez Edge Function lub RPC, można dać tylko `service_role`, ale GRANT nadal musi być jawny.
- `scripts/smoke-supabase-grants.cjs` i komenda `npm run test:smoke:supabase-grants` są podpięte do release runnera, więc ZIP nie powinien przejść, jeśli nowy SQL tworzy tabelę bez GRANT/RLS.
- `supabase/migrations/archive/supabase-grants-audit-wawis.sql` jest do ręcznego sprawdzenia produkcyjnej bazy w Supabase SQL Editor. Najpierw uruchamiaj sekcję A, bo tylko pokazuje obecne uprawnienia.

## Bieżące migracje SQL
- dla tej wersji bieżącym punktem wejścia jest `supabase/migrations/current/production-upgrade-v8.17.sql`; wersja 8.17 nie wymaga zmian struktury bazy.
- historyczne pliki SQL z poprzednich etapów są przeniesione do `supabase/migrations/archive/` jako archiwum/hotfixy do odtwarzania starszych wdrożeń, ale nie traktujemy ich jako nowej sekwencji do uruchamiania bez konkretnego powodu.
- każda kolejna nowa tabela nadal musi mieć jawny `GRANT` i `alter table ... enable row level security`, a `npm run test:smoke:supabase-grants` ma blokować release przy brakach.

## Naprawa produkcyjnej bazy po migracjach
- `supabase/migrations/archive/sms-module-stage-9-log-cleanup.sql` dodaje funkcję `admin_cleanup_sms_duplicate_logs`, która czyści stare duplikaty logów SMS powstałe przed grupowaniem urządzeń w wersji 7.62; funkcję uruchamia moduł SMS przy pobieraniu snapshotu i odświeżaniu kolejki.
- plik `supabase/migrations/archive/devices-module-stage-7-source-job-id-text-production-hotfix.sql` uruchamiamy w pierwszej kolejności przy błędzie `column source_job_id is of type uuid but expression is of type text`; naprawia typ kolumny, funkcje i trigger synchronizacji urządzeń z montażami.
- plik `supabase/migrations/archive/db-repair-production-post-migrations.sql` zbiera krytyczne poprawki produkcyjne w jednym miejscu
- uruchamiamy go w Supabase SQL Editor wtedy, gdy po migracjach pojawiają się błędy zapisu urządzeń albo usuwania montażu
- zakres naprawy:
  - `devices.source_job_id` — zamiana typu na `text` oraz partial unique index na zwykły unique index, żeby `id_montażu::device-N` i `ON CONFLICT (source_job_id)` działały poprawnie
  - `devices.contractor_id` — usunięcie `NOT NULL` i ustawienie FK na `ON DELETE SET NULL`
  - `photo_audit_log.job_id` — usunięcie FK do `jobs`, żeby audit log zdjęć nie blokował usuwania kart montaży
- po uruchomieniu skryptu trzeba odświeżyć aplikację i sprawdzić dwie ścieżki:
  - edycja montażu z zapisem modelu urządzenia i numeru seryjnego
  - usuwanie karty montażu z poziomu klienta


## Diagnostyka produkcyjnej bazy bez zmian
- plik `supabase/migrations/archive/db-health-check.sql` służy wyłącznie do odczytu i diagnozy; nie wykonuje żadnych `ALTER`, `DROP`, `CREATE` ani `UPDATE`
- plik `supabase/migrations/archive/db-health-check-details.sql` rozszerza diagnostykę o kolumnę z gotowymi komendami naprawczymi, dzięki czemu obok statusu `OK/CHECK` od razu widać sugerowany SQL do uruchomienia w SQL Editorze
- uruchamiamy go przed pakietem naprawczym albo po migracjach, gdy chcemy sprawdzić stan produkcyjnej bazy bez ryzyka zmian
- wynik `supabase/migrations/archive/db-health-check-details.sql` zawiera dla każdego sprawdzenia trzy kluczowe pola: status, opis problemu i `suggested_fix` z gotową komendą SQL
- zakres diagnostyki:
  - `devices.source_job_id` — sprawdza, czy kolumna ma typ `text` oraz czy indeks jest zwykłym unique indexem zgodnym z `ON CONFLICT (source_job_id)`
  - `devices.contractor_id` — sprawdza, czy kolumna dopuszcza `NULL` i czy FK działa jako `ON DELETE SET NULL`
  - `photo_audit_log.job_id` — sprawdza, czy usunięto FK do `jobs` i czy został indeks do historii audytu
## Pliki SQL i backend
- migracje i funkcje SQL są trzymane w głównym katalogu projektu
- endpointy pomocnicze i integracje są w `api/` oraz `supabase/`

## Notatka porządkowa
- starsze szczegółowe opisy etapów i hotfixów zostały przeniesione do `CHANGELOG.md` oraz osobnych plików roboczych `README-*`
- `README.md` ma być od teraz krótką, aktualną instrukcją pracy i release dla projektu

- `test:smoke:sms-client-details` — kontrola listy SMS bez kolumny statusu oraz klikalnego podglądu danych klienta
- `test:smoke:sms-navigation` — kontrola przycisków `Przejdź do montażu` i `Przejdź do kontrahenta` z podglądu klienta w module SMS
- `test:smoke:sms-street` — kontrola priorytetu ulicy w module SMS dla źródła `Urządzenie`: najpierw `device.contractor_street`, potem `linkedJob.street`
- `test:smoke:sms-street-sql` — kontrola, że funkcje SQL/RPC urządzeń zwracają `contractor_street`, więc moduł SMS dostaje ulicę kontrahenta także z backendu
- `test:smoke:sidebar-settings` — kontrola, że pozycje `Szablony SMS` i `Ustawienia` w desktopowym menu administratora naprawdę otwierają kartę ustawień SMS z treścią szablonu

## Tryb mock Supabase
- Do testów desktopowych można uruchomić aplikację z `VITE_SUPABASE_MODE=mock`.
- Dane testowe są lokalne: administrator `admin@wawis.test` / `test1234`, pracownik `pracownik@wawis.test` / `test1234`.
- Mock obsługuje podstawowe tabele `profiles`, `jobs`, `job_access`, `comments`, `photos`, `notifications`, `contractors`, `devices`, `sms_log` oraz RPC potrzebne do przejścia przez `Montaże`, `Kalendarz`, `SMS`, `Kontrahenci` i `Urządzenia`.

- `npm run test:smoke:desktop-jobs-split-scroll` — pilnuje, że desktopowy moduł Montaże ma niezależne przewijanie lewej tabeli i prawego panelu szczegółów.

- `test:smoke:mobile-photo-compression` — kontrola mobilnej kompresji zdjęć: limit 1800 px, jakość JPG 78%, wysyłka przygotowanego pliku i brak zmian w desktopowym module zdjęć.


## Test regresyjny wersji 8.63
- `node scripts/smoke-nameplate-finish-verification.cjs` sprawdza lekkie zapytanie wyłącznie do tabeli `photos`, ponowienie błędu 503 oraz poprawne rozpoznanie tabliczek JZ/JW po `storage_path`.
- `smoke-mobile-serial-scanner.cjs` i `verify-release.cjs` pilnują, aby zakończenie nie wróciło do pobierania całych szczegółów przez `reloadJobDetails`.

## Test regresyjny wersji 8.62
- `npm run test:smoke:nameplate-rendering` sprawdza zgodność ramki kadrowania z rzeczywistym obrazem oraz tryb `contain` w mobile i desktopie.


## 9.01 — uzupełnienie katalogu EAN
Dodano Teta Mirror TM35Xi R16 oraz agregaty Hiro Multi S-Line, N-Line i HP-Line. Po wdrożeniu należy uruchomić `nameplate-product-catalog-multi-teta-seed-v9.01.sql`.

- `npm run test:smoke:mobile-new-job-comment` — sprawdza kompaktowy komentarz, kontrolowane nagrywanie oraz ukrycie instalatorów przy tworzeniu nowego zlecenia.
