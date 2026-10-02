Warning: truncated output (original token count: 33316)
Total output lines: 1200

## Aktualna wersja
- 12.28

Wersja 12.27 naprawia kolejkę SMS: przy technicznych duplikatach aplikacja zawsze wybiera aktualny rekord główny (`reminder_group_primary = true`), generator kolejki zachowuje tę samą zasadę, a kolumna statusu SMS na desktopie jest szersza. Zabezpieczenia przed ponowną wysyłką pozostają bez zmian.

Wersja 12.26 zmienia kolejność zakończenia montażu dla pracownika: protokół klienta jest dostępny już przy statusie „W trakcie”, musi zostać wypełniony, podpisany i zapisany przed zmianą statusu na „Zakończone”. Przycisk „Zakończ” pozostaje zablokowany bez zapisanego protokołu, a baza dodatkowo egzekwuje ten warunek przy bezpośredniej próbie zmiany statusu. Administrator zachowuje możliwość ręcznego zakończenia zlecenia bez protokołu. Dotychczasowy warunek kompletu tabliczek JW/JZ pozostaje bez zmian.

Wersja 12.25 naprawia desktopowy moduł SMS, który przy samym wejściu potrafił uruchamiać kilka ciężkich zapytań Supabase równolegle i kończyć ładowanie timeoutem. Pierwszy odczyt SMS jest teraz wykonywany bez równoległego generatora kolejki, pełna baza urządzeń jest dociągana dopiero po snapshotcie, równoległe identyczne snapshoty SMS są deduplikowane, a moduł SMS nie uruchamia przy okazji katalogu kontrahentów ani metryk Centrum 360. Błędy Supabase są prezentowane czytelnie zamiast „[object Object]”. Na desktopie trzy kafle „Klienci na liście”, „Wysłane w tym miesiącu” i „Niewysłane” są w jednym rzędzie.

Wersja 12.24 zmienia datę prezentowaną na listach zleceń: w sekcji „Zakończone” desktop i mobile pokazują rzeczywistą datę zakończenia z `completed_at`, a pozostałe statusy nadal pokazują datę montażu. Desktop zmienia także nagłówek kolumny na „Data zakończenia”, a sortowanie daty dla zakończonych korzysta z tej samej wartości. Starsze zakończone zlecenia bez `completed_at` pokazują „Brak daty” zamiast podstawiania daty montażu.

Wersja 12.23 rozszerza Etap 5 SMS o zakładkę „Niewysłane”. Pokazuje przeterminowane przypomnienia, których nie wysłano w 62-dniowym oknie, i pozwala administratorowi ręcznie wysłać je ponownie. Stary wpis NIEWYSŁANO pozostaje w historii, a ponowienie tworzy nową próbę z aktualnym numerem i aktualną zgodą SMS. Usunięto mylący komunikat o automatycznej wysyłce 7 dni przed terminem; wysyłka pozostaje ręczna.

Wersja 12.22 rozpoczyna Etap 5 modułu SMS i naprawia regresję widoku po Etapie 3. Snapshot SMS rozdziela dane kolejki, wysłane w bieżącym miesiącu i ograniczoną historię, dzięki czemu licznik wysłanych nie zależy już od ostatnich 300 wpisów. Starsze urządzenia bez source_job_id mają jawne ustawienia sms_consent i sms_reminder_enabled na poziomie urządzenia; jeśli mają kontrahenta i poprawny numer, wracają do kolejki bez cofania walidacji dla nowych lub uszkodzonych powiązań.

Wersja 12.21 domyka Etap 4 modułu SMS: niezawodną ścieżkę wysyłki i statusów. Przed połączeniem z SMSAPI claim zapisuje treść i kontekst wysyłki, każda wiadomość dostaje providerowy `idx` oparty na claimie oraz `check_idx=1`, a po przyjęciu wiadomości provider ID i `sms_log` są utrwalane atomowo. Jednoznaczne odrzucenie operatora zwalnia claim i może być ponowione, natomiast timeout/5xx lub nieudany zapis po akceptacji pozostawia claim zablokowany, aby nie wysłać duplikatu. Webhook potrafi odzyskać brakujący log z `idx → claim_id`, a frontend traktuje każdą odpowiedź `{ok:false}` jako błąd.

Wersja 12.20 domyka Etap 3 modułu SMS. Nowi klienci nadal mają SMS-y i przypomnienia domyślnie włączone; domyślne wartości bazy zostały zrównane z aplikacją. Harmonogram przypomnienia jest liczony osobno dla każdego urządzenia, daty końca miesiąca są domykane kalendarzowo, okno 62 dni liczone jest w dniach kalendarzowych w strefie Europe/Warsaw, a bezpośrednio przed wysyłką serwer ponownie pobiera aktualny numer, zgodę, włączenie przypomnień i termin. Urządzenie bez jednoznacznego powiązania z kartą klienta nie dostaje automatycznej zgody na SMS.

Wersja 12.18 zabezpiecza historię SMS przed fizycznym kasowaniem i przypadkowym nadpisaniem. Automatyczny cleanup nie usuwa już wpisów, odczyt modułu i generator nie uruchamiają cleanupu jako efektu ubocznego, anulowanie oczekującej pozycji odbywa się atomowo przez serwerowe RPC, a relacje `sms_log` do montaży i urządzeń używają `ON DELETE SET NULL`, dzięki czemu historia pozostaje po usunięciu źródła.

Wersja 12.17 usuwa powtarzające się SMS-y dla jednego klienta. Aktywne przypomnienia kilku urządzeń są łączone na podstawie numeru telefonu w jedno 62-dniowe okno serwisowe, nawet gdy urządzenia mają różne daty montażu i różne numery cyklu. Jedna skuteczna wysyłka blokuje pozostałe bliskie przypomnienia, a historia i widok „Wysłane w tym miesiącu” pokazują jeden wpis grupowy. Produkcyjna funkcja `generate-service-sms-queue` jest aktualizowana razem z migracją cleanupu, która nie usuwa faktycznej historii skutecznych wysyłek.

Wersja 12.16 poprawia czytelność zwijanych sekcji w zakończonych montażach na desktopie. „Urządzenia” i „Zdjęcia montażu” nie rozciągają się już jako szerokie puste kafle; mają kompaktowe paski, wyraźniejszą ramkę i większy chevron w osobnym polu. Cały pasek pozostaje klikalny, bez napisów „rozwiń/zwiń”. Mobile bez zmian funkcjonalnych.

Wersja 12.15 zagęszcza prawy panel szczegółów na desktopie: kafelki e-mail, telefonu, daty montażu i zakończenia są węższe; osoba kończąca zlecenie jest widoczna jako mały badge z inicjałami obok daty i godziny. Dla montażów Zakończonych domyślnie zwinięte są tylko sekcje „Urządzenia” i „Zdjęcia montażu”; pozostałe sekcje pozostają rozwinięte. Mobile bez zmian funkcjonalnych.

Wersja 12.14 porządkuje prawy panel szczegółów montażu na desktopie: pod nagłówkiem „Klient” wyświetlany jest najpierw adres, następnie e-mail i telefon, a niżej data montażu i — dla zakończonego zlecenia — data zakończenia. Osobna karta „Adres i termin” została usunięta; „Protokół klienta” znajduje się od razu pod scaloną kartą klienta. Mobile bez zmian funkcjonalnych.

Wersja 12.13 upraszcza niezakończone montaże na desktopie: dla statusów Nowe, W trakcie i Niezrealizowane ukryty jest cały pasek Faktura VAT / Płatność / Wystaw fakturę, a kolumna FV w tabeli nie pokazuje czerwonego statusu przed zakończeniem zlecenia. Funkcje fakturowe pozostają wyłącznie przy montażach Zakończonych.

Wersja 12.12 usuwa przypadek, w którym desktop od razu pokazywał zapamiętany błąd szczegółów z poprzedniego wejścia i nie wykonywał żadnego nowego zapytania. Przy każdym ponownym otwarciu zlecenia stary błąd jest czyszczony, uruchamiany jest nowy cykl pobrania, a w ramach tego cyklu nadal obowiązuje timeout 12 s i automatyczny retry z 12.11.

Wersja 12.11 poprawia odporność desktopowych szczegółów montażu na chwilowe opóźnienia Supabase: limit pojedynczej próby rośnie do 12 s, timeout lub błąd sieciowy uruchamia automatyczną drugą próbę po 1,5 s, a komunikat z przyciskiem „Ponów” pojawia się dopiero po nieudanym retry. Diagnostyka zapisuje retry, odzyskanie i końcową porażkę odczytu.

Wersja 12.10 porządkuje desktopowy pasek faktury: status „Faktura VAT”, metoda płatności i „Wystaw fakturę” są zawsze trzymane w jednym wierszu, a przycisk Fakturowni ma neutralny, czytelny wygląd bez mocnego niebieskiego tła. Po trwałym potwierdzeniu faktury przez Fakturownię aplikacja nie uruchamia już ponownej weryfikacji statusu dla tego montażu. Dodatkowo mobilna karta po otwarciu odświeża w tle zapisane szczegóły, dzięki czemu komentarz dodany po wcześniejszym odczycie nie pozostaje ukryty przez stary cache.

Wersja 12.09 poprawia prefill pozycji Fakturowni: nazwa usługi i stawka VAT są przekazywane jako `invoice[positions][0][...]`, zgodnie ze strukturą `positions` używaną przez Fakturownię. Płatność, status i termin z 12.08 pozostają bez zmian; kliknięcie nadal nie tworzy faktury automatycznie.

Wersja 12.08 rozszerza przycisk „Wystaw fakturę” o wstępne uzupełnienie formularza Fakturowni: nazwę usługi z marką klimatyzatora, VAT 23% dla firmy / 8% dla osoby bez NIP oraz płatność z protokołu (gotówka: opłacona bez terminu; przelew: wystawiona, termin 3 dni). Kliknięcie nadal nie tworzy faktury automatycznie.

Wersja 12.07 usuwa wartości dostępowe z testu regresyjnego integracji GUS. Funkcjonalność lookupu NIP pozostaje bez zmian; klucz BIR jest oczekiwany wyłącznie jako sekret serwerowy Supabase.

Wersja 12.06 dodaje automatyczne pobieranie danych firmy z GUS REGON BIR po NIP-ie w formularzu montażu i module Kontrahenci. Lokalny kontrahent ma pierwszeństwo, a zewnętrzny lookup działa przez zabezpieczoną Edge Function.

Wersja 11.97 domyka automatyczne kody pocztowe: pełny adres jest sprawdzany przez GUGiK, a dla samej znanej miejscowości aplikacja może użyć wcześniej uzupełnionych adresów WAWIS. Wersja 11.96 uporządkowała mobilny układ adresu i przekazywanie kodu do Fakturowni.

Wersja 11.95 dodaje na desktopie przycisk „Wystaw fakturę”. Aplikacja bezpiecznie synchronizuje dane klienta do Fakturowni przez serwerową Edge Function i otwiera formularz faktury; samo kliknięcie nie tworzy dokumentu.

Wersja 11.80 dodaje wyłącznie w aplikacji mobilnej zoom zdjęć w pełnym podglądzie: pinch 100–400%, przesuwanie powiększonego zdjęcia, szybkie 250% po podwójnym stuknięciu oraz przyciski − / + / 100%. Desktopowy podgląd zdjęć pozostaje bez zmian.

# Wawis Klimatyzacja — wersja 12.27

## Stabilizacja diagnostyki, PUSH i Supabase — 11.20

- ponawianie ładowania miniatury jest ostrzeżeniem; błąd powstaje dopiero, gdy zawiedzie również odczyt oryginalnego zdjęcia,
- odzyskana miniatura zapisuje techniczny sukces i nie zaśmieca centralnej listy błędów,
- desktopowa Diagnostyka administratora pokazuje dla każdego profilu stan PUSH, liczbę aktywnych i historycznych subskrypcji, urządzenie oraz ostatnią aktywność,
- administrator może odczytać techniczny status subskrypcji zespołu; pracownik nadal widzi wyłącznie własne rekordy PUSH,
- 13 polityk RLS używa stabilnych wywołań `(select auth.uid())` / `(select helper())`, zgodnie z zaleceniami Supabase,
- usunięto trzy zdublowane indeksy bez zmiany danych,
- odebrano rolom aplikacji możliwość bezpośredniego wywoływania trzech funkcji używanych wyłącznie przez triggery.


## Push po tankowaniu pracownika — 10.23

- po udanym zapisie tankowania przez pracownika aplikacja wywołuje osobną funkcję `send-fuel-entry-push`,
- administrator otrzymuje push „Nowe tankowanie” z pracownikiem, samochodem i ilością paliwa,
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
- aktywna galeria jest zapamiętywana przez podgląd i zerowana po przejściu do i…13316 tokens truncated…erszu; skrajnie długie wartości zachowują bezpieczny wielokropek.
- wersja `11.01` — mobilne szczegóły montażu są realnie zagęszczone na szerokości iPhone'a, pełny e-mail pozostaje widoczny, a wiersze urządzeń i przyciski zajmują mniej miejsca.
- wersja `11.00` — mobilne szczegóły montażu są bardziej zwarte, a e-mail, telefon, adres i nagłówki urządzeń pozostają w jednym wierszu na ekranie telefonu.
- wersja `10.74` — uzupełnij opis ostatniej poprawki po zakończeniu zmian.
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
- `npm run test:smoke:sms-job-grouping` — smoke grupowania SMS; pilnuje grupowania montaży i urządzeń klienta oraz stałego anchoru 62 dni, w tym przypadku 1/60/120 dni.
- `npm run test:smoke:sms-durable-groups` — smoke Etapu 2; sprawdza trwałe grupy w bazie, group-level claim, kanoniczny log grupy i zgodność desktop/mobile.
