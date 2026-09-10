# RELEASE RESULT - Wawis 9.15

## Wersja
- 9.15

## Zakres
- uporządkowano mobilny panel administratora widoczny na przesłanym screenie,
- menu `Montaże / Kontrahenci / Urządzenia / SMS` ma cztery równe kolumny i ograniczoną automatyczną zmianę rozmiaru tekstu Safari,
- dodano `viewport-fit=cover` oraz obsługę `safe-area-inset-*`, aby górne menu nie wchodziło pod pasek systemowy iPhone'a,
- `WERSJA 9.15` oraz trzy akcje administratora są utrzymywane w jednym rzędzie bez zawijania,
- usunięto osobną ikonę wylogowania administratora; kliknięcie pola z nazwą użytkownika wykonuje wylogowanie,
- pracownik nadal ma osobną ikonę wylogowania, bo jego pole użytkownika zachowuje funkcję filtrowania własnych zleceń,
- przycisk odświeżania wykonuje realne `window.location.reload()` zamiast samego `refreshAll()`.

## Diagnoza przycisku odświeżania
W 9.14 przycisk wykonywał wyłącznie `refreshAll(sessionUser)`. Ta funkcja ponownie pobierała rekordy z Supabase, ale nie przeładowywała strony ani zasobów aplikacji i nie pokazywała potwierdzenia. Przy braku zmian w danych użytkownik nie widział żadnej reakcji. W 9.15 przycisk jest celowo funkcją pełnego przeładowania aplikacji. Push Service Worker nie przechwytuje zapytań `fetch`, więc nie blokuje tego przeładowania cache'em aplikacyjnym.

## Supabase
- brak nowej migracji SQL dla 9.15,
- zmiany 9.14 (`job-completion-tracking-v9.14.sql` i Edge Function push) pozostają wymagane, jeżeli nie zostały jeszcze wdrożone.

## Kontrola wykonana lokalnie
Po dwa przebiegi PASS:
- `test:smoke:mobile-admin-header`,
- `test:smoke:version`,
- `test:smoke:mobile-ui-copy`,
- `test:smoke:mobile-style-bootstrap`,
- `test:smoke:release-runner`,
- `test:smoke:job-completion`,
- `test:smoke:release-visual-controls`.

Dodatkowo `verify:release` przeszedł 2× PASS po zapisaniu wersji i raportu.

## Build / Playwright
- `npm run build` został uruchomiony diagnostycznie dwukrotnie, ale oba przebiegi zatrzymały się przed kompilacją na instalacji brakujących zależności,
- w trybie offline npm zwrócił `ENOTCACHED` dla `yallist-3.1.1.tgz`, a następnie dla `@vitejs/plugin-react`; środowisko nie ma tych paczek w cache,
- wcześniejsza próba sieciowego `npm run build` zawisła podczas `npm ci`, więc proces został przerwany; nie powstał częściowy `dist`,
- w związku z tym nie deklarujemy lokalnego PASS pełnego Vite/Playwright dla 9.15; błąd wystąpił przed kompilacją kodu aplikacji.

## Wdrożenie
Dla samej zmiany 9.15 nie ma nowego SQL. Po rozpakowaniu paczki należy podpiąć katalog do właściwego projektu `wawis-klima` i wykonać `vercel.cmd --prod`.
