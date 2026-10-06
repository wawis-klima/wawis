# WAWIS — Closure Gate

Ten dokument definiuje stałą zasadę zamykania zmian w całej aplikacji WAWIS.

## Cel

Zmiana nie jest uznana za zamkniętą tylko dlatego, że kod się buduje albo pojedynczy smoke test przechodzi. Zamknięcie wymaga dowodu, że sprawdzono rzeczywisty przepływ i najważniejsze kontrprzykłady.

## Obowiązkowa zasada po każdym znalezionym błędzie

Każdy potwierdzony błąd wykryty ręcznie, przez audyt, Codex lub produkcję musi przed zamknięciem dostać trwały test regresyjny w repozytorium. Test ma odtwarzać mechanizm błędu, nie tylko sprawdzać obecność fragmentu kodu.

Jeżeli błąd był możliwy dopiero przy określonej sekwencji zdarzeń, retry, race condition, dużej liczbie rekordów albo odświeżeniu UI, test musi odtwarzać właśnie ten warunek.

## Cztery warstwy dowodu

Dla zmian funkcjonalnych stosujemy, odpowiednio do ryzyka:

1. **Regresja podstawowa** — poprawny typowy przypadek.
2. **Kontrprzykład** — przypadek, który wcześniej łamał założenie albo mógł je złamać.
3. **Granica / odporność** — np. wielokrotne retry, >1000 rekordów, częściowa porażka, duplikat callbacku, równoległość, stale state.
4. **Pełny przepływ** — połączenie warstw, np. UI → moduł → Edge Function/RPC → baza → refresh albo Playwright E2E.

Nie każda kosmetyczna zmiana potrzebuje wszystkich czterech warstw. Zmiana TARGETED lub CRITICAL nie może być zamknięta wyłącznie testem statycznym typu regex/assert.match.

## Dowody CI

Każdy PR do main zapisuje artefakt **wawis-closure-evidence** zawierający co najmniej:

- changed-files.txt,
- release-impact.json,
- closure-evidence.json,
- closure-e2e-evidence.json, jeżeli E2E było wymagane,
- closure-gate-result.json.

closure-evidence.json zawiera grupy testowe, wszystkie uruchomione komendy i wynik każdej komendy. Closure Gate działa fail-closed: brak wymaganego dowodu oznacza NO-GO.

## Zasady domenowe

scripts/release-impact.cjs wskazuje dotknięte domeny. Każda domena ma własną grupę regresji w scripts/test-groups.cjs. Jeżeli zmiana dotyczy wielu domen, wykonywana jest suma testów bez duplikowania komend.

SMS ma osobną grupę `sms`, ponieważ jego poprawność zależy równocześnie od UI, SQL, Edge Functions, retry, callbacków i paginacji.

## Zasada rozwoju testów

Closure Gate jest kumulacyjny: kiedy wykryjemy nową klasę błędu, dodajemy jej reprodukcję do stałego zestawu testów. Nie usuwamy testu tylko dlatego, że konkretna poprawka została już wdrożona.

Każde potwierdzone znalezisko wpisujemy także do `REGRESSION-LEDGER.md`. Status CLOSED jest dozwolony dopiero po wskazaniu trwałego pliku testowego i zielonym Closure Gate.

## Race condition i test wielosesyjny

- Jeżeli błąd dotyczy podwójnej rezerwacji, locków, retry, callbacków lub równoległego zapisu, a środowisko pozwala wykonać bezpieczny test bez kontaktu z klientem, przed statusem CLOSED uruchom test na co najmniej dwóch niezależnych sesjach PostgreSQL albo równoważny test rzeczywistej konkurencji.
- Dowód ma zawierać rozróżnialne sesje (np. `pg_backend_pid()`), oczekiwany wynik „jeden zwycięzca / pozostali zablokowani” oraz kontrolę końcowej liczby rekordów.
- Test nie może wywoływać SMSAPI ani innych zewnętrznych skutków ubocznych, jeżeli do sprawdzenia wystarcza warstwa claim/rezerwacji.
- Syntetyczny fixture musi być jednoznacznie oznaczony i po teście usunięty albo pozostawiony w dozwolonym, nieaktywnym stanie zgodnie z ochroną historii.
- Jeżeli realny test wielosesyjny jest niemożliwy, raport musi to jawnie oznaczyć jako brak dowodu runtime; analiza statyczna sama nie zamyka race condition wysokiego ryzyka.

## Dowód post-deploy bez pętli wersji

- Wynik deploymentu jest dowodem zewnętrznym z GitHub/Vercel i nie wymaga kolejnego commita wyłącznie po to, by zmienić `PENDING` na `PASS`.
- Źródłowy status release nie może wymuszać samonapędzającej się pętli: commit statusowy → nowy deploy → nowy statusowy commit.
- Każdy rzeczywisty nowy deployment nadal wymaga podbicia wersji aplikacji.

## Integralność migracji Supabase

- Każdy plik w `supabase/migrations` musi mieć unikalny 14-cyfrowy numer wersji.
- Dwa pliki z tym samym timestampem migracji oznaczają NO-GO, nawet jeżeli testy funkcjonalne przechodzą.
- Zmiana migracji nie może pozostawiać innego końcowego schematu na świeżym rebuildzie niż na produkcji po kolejnych wdrożeniach.

## GO / NO-GO

GO:
- klasyfikacja zmian istnieje,
- wszystkie wybrane grupy wykonały się,
- wszystkie komendy mają status passed,
- wymagane E2E wykonało się i przeszło,
- closure-gate-result.json ma status GO.

NO-GO:
- brak pliku dowodowego,
- pominięta wybrana grupa,
- nieuruchomiona komenda,
- dowolny failed,
- wymagane E2E bez dowodu lub z błędem.

Ta zasada obowiązuje całą aplikację WAWIS, nie tylko moduł SMS.
