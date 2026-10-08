# WAWIS — zasady dla agentów kodujących

## Tryb domyślny
- Najpierw analizuj, potem proponuj. Nie modyfikuj kodu bez wyraźnego polecenia.
- Przy audycie traktuj repozytorium jako read-only.
- Nie wdrażaj, nie merguj, nie pushuj do `main`, nie twórz migracji ani nie zmieniaj danych produkcyjnych.

## Obszary chronione
Bez osobnej zgody nie zmieniaj:
- Supabase: schematu, migracji, RLS, uprawnień, Storage, Edge Functions, sekretów;
- auth, ról admin/pracownik, Realtime, push, service workera i cache;
- procesu release GitHub/Vercel, `RELEASE-GATE.json`, workflowów i polityk deployu;
- logiki protokołów PDF/e-mail, uploadu zdjęć i retry;
- danych klientów ani logiki produkcyjnej.

## Wierność testom audytu Codex — obowiązkowe
- Dla każdego ustalenia Codexa czytaj oryginalny raport, scenariusz RED, wskazany reproduktor oraz pełną macierz testów odbiorczych; utrzymuj mapę ustalenie → test → wynik → dowód.
- Nie zastępuj oryginalnego testu własnym testem o mniejszym zakresie. Jeżeli test oryginalny jest uszkodzony, napraw jego atrapę, zachowaj asercje i odpal oryginał.
- Testuj wykonanie rzeczywistego kodu lub SQL na bezpiecznych fixture; statyczne regexy są wyłącznie pomocnicze.
- Brak testu dwusesyjnego, dostawcy, uprawnień czy sekwencji oznacz NOT VERIFIED, nawet gdy CI jest zielone. Nie nazywaj tego CLOSED.
- Najpierw odtwórz RED na badanej wersji, potem wymagaj GREEN po naprawie; przy istniejącej poprawce dołącz dowód bezpiecznego odtworzenia RED na starej referencji, jeśli to wykonalne.
- Przed każdą publikacją sprawdzaj wszystkie punkty oryginalnego audytu, grupy regresji, Closure Gate, numer aplikacji i wersję aktywnego backendu; ewidencjonuj co jest poza zakresem symulacji.

## Zasady domknięcia zmian
- Obowiązuje globalny `CLOSURE-GATE.md`; dotyczy każdego modułu, nie tylko SMS.
- Każdy potwierdzony błąd musi dostać trwały test regresyjny odtwarzający rzeczywisty mechanizm błędu przed uznaniem poprawki za zamkniętą.
- Dla błędów sekwencyjnych testuj całą sekwencję (np. retry po retry, callback po nowej próbie, refresh po częściowym błędzie), a nie tylko pierwszy krok.
- Dla problemów granicznych odtwarzaj granicę (np. >1000 rekordów), zamiast sprawdzać tylko typowy mały fixture.
- Test statyczny typu regex/assert.match może być dowodem pomocniczym, ale nie może być jedynym dowodem dla zmiany TARGETED lub CRITICAL.
- Przed zamknięciem zmiany wymagaj zielonego Closure Gate i zachowanego artefaktu dowodowego CI.
- Potwierdzone błędy wpisuj do `REGRESSION-LEDGER.md`; status CLOSED wymaga wskazania konkretnego trwałego testu.
- Dla race condition w bazie, jeżeli jest to bezpieczne i wykonalne, wykonaj również test na dwóch niezależnych sesjach PostgreSQL i zapisz dowód jednego zwycięzcy oraz końcowego stanu danych.
- Nie twórz po deployu kolejnego commita tylko po to, by zmienić status ewidencyjny; końcowy dowód deploymentu pochodzi z GitHub/Vercel. Każdy faktyczny kolejny deploy wymaga natomiast nowego numeru wersji.

## Zasady audytu
- Każde znalezisko musi zawierać dowód: plik, funkcję/fragment i wyjaśnienie mechanizmu problemu.
- Nie zgłaszaj problemu tylko na podstawie stylu lub przypuszczenia.
- Odróżniaj faktyczne błędy od długu technicznego i sugestii refaktoru.
- Priorytety: P0 = ryzyko utraty danych/bezpieczeństwa/awarii produkcji; P1 = poważny błąd lub freeze/race; P2 = wydajność, utrzymanie, duplikacja, jakość testów; P3 = kosmetyka.
- Preferuj małe, odwracalne poprawki i osobne PR-y.
- Nie wykonuj destrukcyjnych komend ani zewnętrznych operacji produkcyjnych.

## Kontekst aplikacji
WAWIS to aplikacja React/Vite z Supabase, mobilnym interfejsem dla pracowników i desktopowym panelem administratora. Kluczowe moduły obejmują montaże, kontrahentów, urządzenia, zdjęcia/tabliczki, protokoły PDF/e-mail, push, paliwo/tankowania, diagnostykę i release automation.
