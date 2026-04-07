5.31
- przeniesiono na desktop ostatnie zmiany z mobilki dla pola adresu
- miejscowość i ulica są teraz połączone w jedno pole „Adres”
- zmniejszono trochę czcionkę adresu także w wersji desktopowej

5.30
- na aplikacji mobilnej zmniejszono czcionkę wspólnego pola adresu na kartach zleceń
- poprawka dotyczy pola „Adres” z połączoną miejscowością i ulicą

KLIMA APP — instrukcja startowa i historia wersji

AKTUALNA WERSJA
- wersja aplikacji: 5.26
- źródła numeru wersji: app-version.json oraz package.json
- kolejną wersję podbijamy zawsze o 1 na końcu, np. 5.25 -> 5.26 -> 5.27

KOMENDY
- podbicie wersji: npm run version:bump
- build produkcyjny: npm run build
- paczka ZIP do podmiany plików: npm run zip:release
- pełny proces kolejnej wersji: npm run release

WAŻNE
- Przy każdej nowej wersji przygotowujemy ZIP ze wszystkimi plikami projektu.
- Po każdej zmianie trzeba sprawdzić build i poprawność działania.
- Historia wersji

5.29
- tylko na aplikacji mobilnej połączono miejscowość i ulicę w jedno pole „Adres” w kartach zleceń
- status pozostaje po prawej stronie karty

5.28
- poprawiono pozycję statusu w kartach zleceń tylko na aplikacji mobilnej
- status pod ulicą jest teraz dociśnięty maksymalnie do prawej strony

 jest prowadzona od obecnej linii wydań 5.x.

WYMAGANE ZMIANY W SUPABASE
- dodaj kolumnę telefonu:
  alter table jobs add column if not exists phone text;

- dodaj głównego montera:
  alter table jobs add column if not exists main_technician_id uuid references profiles(id);

- aby usuwanie działało poprawnie, uruchom plik:
  delete-policy.sql

- aby dodać pola city i street, uruchom plik:
  city-street.sql

WDROŻENIE CLOUDLFARE PAGES
- aplikacja jest przygotowana do hostingu statycznego na Cloudflare Pages
- plik public/_redirects dodaje fallback dla React SPA
- ustaw w Cloudflare Pages:
  1. Framework preset: Vite
  2. Build command: npm run build
  3. Build output directory: dist
  4. Environment variables: VITE_SUPABASE_URL oraz VITE_SUPABASE_ANON_KEY

UWAGI TECHNICZNE
- Aplikacja korzysta z React + Vite + Supabase.
- Wersja bez modułu wysyłki maili nadaje się do statycznego hostingu.
- Wersja aplikacji jest odczytywana z app-version.json i pokazywana w interfejsie.
- Skrypt zip:release synchronizuje package.json z app-version.json przed spakowaniem paczki.
- Jeżeli po rozpakowaniu pojawi się błąd zależności, wykonaj czystą instalację:
  1. usuń folder node_modules
  2. usuń package-lock.json
  3. uruchom: npm install
  4. uruchom: npm run dev

HISTORIA WERSJI

5.26
- w tej linii wydań była dodana automatyczna wysyłka maila przy nowym przypisaniu montera
- w obecnym wariancie wdrożeniowym moduł maili został usunięty na potrzeby hostingu statycznego

5.25
- na aplikacji mobilnej sekcja monterów została przełączona na dwa rzędy
- desktop pozostał bez zmian

5.24
- zwężono przyciski monterów tylko na aplikacji mobilnej
- zmniejszono wysokość, padding i odstępy, żeby lepiej mieściły się w jednym rzędzie

5.23
- zmniejszono przyciski monterów, żeby łatwiej mieściły się w jednym rzędzie
- zachowano obecny styl i kolor, ale obniżono wysokość oraz padding przycisków

5.22
- w sekcji „Monterzy” skrócono podpisy do formatu: pierwsza litera imienia + nazwisko
- dzięki temu przyciski łatwiej mieszczą się w jednym rzędzie przy zachowaniu obecnego stylu

5.21
- przyciski monterów pokazują pełne imię i nazwisko w niższej, bardziej zwartej formie
- zaznaczony pracownik ma wyraźniej ciemniejszy niebieski kolor

5.20
- przywrócono jaśniejszy, niebieski wygląd przycisków monterów
- zachowano obecny kształt i lekko powiększono elementy

5.19
- na karcie klienta administratora uproszczono wybór monterów pod sekcją zdjęć
- zamiast pełnych kolorowych przycisków są czarno-białe okrągłe badge z inicjałami
- badge są w jednej linii i nadal pozwalają zaznaczać, czy pracownik jest monterem
- po najechaniu lub dłuższym wskazaniu widać imię i nazwisko pracownika

5.18
- Administrator: z karty klienta usunięto pola Monterzy i Data na desktopie i mobile

5.17
- usunięto przycisk „Zapisz komentarz” z karty klienta na koncie administratora
- komentarz administratora jest teraz tylko do podglądu

5.16
- uporządkowano skrypt version-bump.cjs
- nowa logika wersjonowania zwiększa wyłącznie ostatni człon numeru wersji
- wersje przechodzą teraz kolejno np. 5.9 -> 5.10 -> 5.11 bez przeskoku do 6.0

5.15
- uporządkowano README
- usunięto stare, niespójne wpisy wersji 24.x i 4.x
- dodano czytelną historię wersji od aktualnej linii 5.x

5.14
- poprawiono zapis edycji na desktopie
- po poprawnym zapisie okno edycji zamyka się od razu
- odświeżenie danych działa w tle zamiast blokować zamknięcie modala

5.13
- poprawiono opóźnienie przy zapisie zmian
- odświeżanie danych w tle nie blokuje już przycisku zapisu
- zapis jest blokowany tylko podczas rzeczywistego zapisu do bazy

5.12
- poprawiono zapis zmian w formularzu edycji montażu
- przycisk „Zapisz zmiany” pobiera aktualne dane formularza przy pierwszym kliknięciu

5.11
- usunięto komunikat przeglądarki „Zlecenie zapisane.” po utworzeniu nowego zlecenia

5.10
- usunięto komunikat przeglądarki „Karta montażu została usunięta.” po usunięciu karty

5.9
- wyrównano oznaczenie statusu typu „W trakcie” do prawej strony w liście zleceń

5.8
- po zmianie statusu etykieta nie pokazuje już „Archiwalne”
- zamiast tego wyświetla się „Zakończone”

5.7
- poprawiono wygląd przycisku „Zakończone zlecenie”
- przycisk ma jednolite czarne tło i biały tekst

5.6
- dodano przycisk „Zakończone zlecenie” w szczegółach klienta dla pracownika
- pracownik może zmienić status z dowolnego na „Zakończone”

5.5
- przycisk z imieniem i nazwiskiem pracownika pokazuje jedną wspólną tabelę wszystkich jego zleceń
- pod ulicą klienta dodano oznaczenie rodzaju zlecenia: Nowe, W trakcie, Niezrealizowane, Zakończone

5.4
- imię i nazwisko pracownika po zalogowaniu zostało zamienione na przycisk
- kliknięcie przełącza widok zleceń przypisanych do tego pracownika

5.3
- badge pracownika otrzymał stały kolor przypisany do konkretnej osoby
- kolor nie zależy już od pozycji na liście

5.2
- wersja bazowa zastana w projekcie
- aplikacja kompiluje się poprawnie
- w projekcie były już dostępne skrypty do podbijania wersji i tworzenia ZIP


## Historia wersji
- 5.43 — desktop: główny układ po zalogowaniu ustawiono na 58% lewy moduł / 42% prawa karta szczegółów.
- 5.42 — desktop: układ po zalogowaniu ustawiony na 55% lewy moduł / 45% prawa karta szczegółów.
- **5.36** — na desktopie przeniesiono status zlecenia obok nazwy klienta oraz zmniejszono wizualnie kolumnę instalatorów, żeby pełny adres lepiej mieścił się w tabeli.
- **5.35** — na desktopie połączono Miejscowość i Ulicę w jedną kolumnę Adres, przy zachowaniu osobnej kolumny Instalatorzy i statusu pod adresem wyrównanego do prawej.
- **5.34** — przywrócono prawidłowy układ tabeli desktopowej: pełne kolumny Miejscowość i Ulica, widoczni instalatorzy oraz status wyrównany do prawej w kolumnie ulicy.
- **5.33** — poprawiono logowanie na desktopie; formularz logowania działa jako submit i pobiera email/hasło także z autofillu przeglądarki.

- 5.37
  - desktop: poprawiono układ tabeli zleceń, żeby status przy kliencie nie nachodził na nazwę
  - desktop: zwężono wizualnie instalatorów i datę oraz poszerzono adres

- 5.38
  - desktop: poszerzono lewy panel z tabelą, żeby było więcej miejsca na klienta i adres
  - desktop: adres pokazuje się w dwóch liniach, dzięki czemu klient i status nie nachodzą już na siebie
  - desktop: dodatkowo zwężono kolumny instalatorów i daty

- 5.40: Powiększono badge’e instalatorów w tabeli desktopowej, żeby były czytelniejsze.

- **5.41** — na desktopie ustawiono proporcje głównego układu po zalogowaniu na 50/50, dzięki czemu karta klienta ma więcej miejsca bez zmian na mobile.

- **5.44**
  - poprawiono logowanie na desktopie: formularz logowania nie gubi już hasła przy autofill przeglądarki i kliknięcie `Zaloguj` czyta aktualne wartości bezpośrednio z pól

- 5.45 — desktop: poprawiono logowanie. Sukces logowania nie jest już cofany przez błąd późniejszego odświeżenia profilu/danych, dzięki czemu nie trzeba klikać „Zaloguj” wiele razy.

- 5.46 — desktop: tabela zleceń po zalogowaniu dostała bardziej dynamiczny układ. Badge statusu dopasowuje się do szerokości napisu, a klient i adres mogą zawijać się do dwóch linii zamiast być sztywno ścinane.


5.48
- Poprawiono wyświetlanie zdjęć z użyciem storage_path -> public URL.
- Poprawiono usuwanie zdjęć: najpierw rekord z bazy, potem plik ze storage, plus natychmiastowe usunięcie z UI.
- Dodano plik photos-delete-policy.sql z politykami DELETE dla photos i storage.objects, jeśli Supabase blokuje usuwanie przez RLS.

- 5.49
  - poprawione usuwanie zdjęć na mobile i desktopie
  - przycisk Usuń pokazuje stan "Usuwanie..."
  - usunięto fałszywy komunikat o błędzie DELETE wynikający z .select() po delete

- 5.50 — Naprawa białego ekranu po otwarciu zlecenia: JobDetailsPanel znów poprawnie odbiera deletingPhotoId i bezpiecznie obsługuje brak photos/viewers/comments.


Wersja aplikacji podnosi się automatycznie przy tworzeniu paczki poleceniem `npm run release` (np. 5.51 -> 5.52).
