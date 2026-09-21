# Prompt do Codexa — pełny audyt WAWIS

Przeprowadź pełny audyt repozytorium `wawis-klima/wawis` w trybie READ-ONLY.

Nie zmieniaj żadnego pliku, nie twórz commitów ani PR-ów, nie wdrażaj niczego i nie wykonuj żadnych operacji na produkcji. Przestrzegaj `AGENTS.md`.

## Cel
Chcę niezależnej oceny jakości, niezawodności, bezpieczeństwa i utrzymywalności całej aplikacji WAWIS przed kolejnymi większymi zmianami.

## Sprawdź szczególnie
1. Supabase: RLS, auth, role administrator/pracownik, Storage, signed URL, Edge Functions, Realtime, obsługę błędów i potencjalne wycieki uprawnień.
2. Mobilną aplikację: freeze'y, race conditions, stan po relogu/przełączeniu użytkownika, synchronizację, retry, upload zdjęć, miniatury, cache i zachowanie przy słabym internecie.
3. Protokoły: generowanie PDF, zapis, podpis, e-mail, idempotencję, timeouty i ryzyko podwójnych zapisów/wysyłek.
4. Push: subskrypcje urządzeń, duplikaty tokenów/subskrypcji, wylogowanie/przelogowanie, iOS/Android, service worker.
5. Paliwo/tankowania: walidację przebiegu, uprawnienia, spójność danych i wyliczenia.
6. CSS/mobile UI: narastające warstwy poprawek `v10xx`, konflikty selektorów, duplikaty i ryzyko regresji wynikające z kolejności importów.
7. Release automation: GitHub Actions, MICRO UI, Vercel, release gates, wersjonowanie, cache service workera, możliwość fałszywych failure/success i zbędne powtórzenia testów.
8. Testy: czy rzeczywiście pokrywają krytyczne ścieżki, gdzie są fałszywie dodatnie/ujemne, które testy są redundantne, a których brakuje.
9. Wydajność: niepotrzebne fetch'e, Realtime subscriptions, re-rendery, ładowanie zdjęć, signed URL cache, bundle i start aplikacji.
10. Dług techniczny: martwy kod, stare obejścia, powielone moduły, nieużywane pliki, niespójne nazewnictwo i fragmenty, które utrudniają dalszy rozwój.

## Sposób pracy
- Najpierw zmapuj architekturę i główne przepływy danych.
- Przejrzyj repo całościowo, nie tylko ostatnie commity.
- Uruchamiaj wyłącznie bezpieczne lokalne testy/statyczną analizę, jeśli pomagają potwierdzić znalezisko.
- Nie zgłaszaj problemu bez konkretnego dowodu w kodzie.
- Dla każdego znaleziska podaj: priorytet P0/P1/P2/P3, plik/obszar, mechanizm błędu, możliwy skutek, jak go odtworzyć lub potwierdzić, oraz najmniejszą bezpieczną poprawkę.
- Wyraźnie oznacz rzeczy, których nie da się potwierdzić statycznie.
- Nie proponuj wielkiego refaktoru bez uzasadnienia; preferuj małe, odwracalne zmiany.

## Raport końcowy
Przygotuj jeden raport z sekcjami:
1. Executive summary — maks. 10 najważniejszych wniosków.
2. Mapa architektury i krytycznych przepływów.
3. P0 — krytyczne.
4. P1 — wysokie ryzyko.
5. P2 — średnie ryzyko / wydajność / utrzymanie.
6. P3 — niskie ryzyko / kosmetyka.
7. Bezpieczeństwo i uprawnienia.
8. Stabilność mobile i synchronizacja.
9. Release/CI/CD.
10. Test coverage i luki.
11. Lista martwego/zbędnego kodu i duplikatów.
12. Proponowany plan napraw w kolejności, podzielony na małe PR-y.

Na końcu dodaj krótką odpowiedź: `Czy aplikacja jest bezpieczna do dalszego rozwijania w obecnej architekturze?` z oceną: TAK / TAK, ALE / NIE, oraz 3–5 zdań uzasadnienia.
