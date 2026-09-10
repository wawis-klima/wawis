# RELEASE RESULT - Wawis 9.20

## Wersja
- 9.20

## Zakres
- mobile administrator: pole `Komentarz administratora` zostało zwężone do kompaktowych 3 wierszy,
- mikrofon komentarza znajduje się w osobnej kolumnie po prawej stronie pola,
- mikrofon otwiera modal `Nagrywanie komentarza` z informacją o aktywnym nasłuchu, podglądem rozpoznawanego tekstu i przyciskiem `Zakończ nagrywanie`,
- po zakończeniu sesji rozpoznany tekst trafia bezpośrednio do `Komentarz administratora`,
- podczas tworzenia nowego mobilnego zlecenia sekcja `Instalatorzy (opcjonalnie)` jest ukryta,
- sekcja `Instalatorzy (opcjonalnie)` nadal jest dostępna przy edycji istniejącego zlecenia,
- bez zmian pozostaje zasada z 9.19: pracownik dodający klienta nie zostaje automatycznie głównym monterem.

## Supabase
- brak nowej migracji SQL,
- brak zmian Edge Function w tej wersji.

## Kontrola wykonana lokalnie — 2 przebiegi PASS
- `test:smoke:mobile-new-job-comment`,
- `test:smoke:mobile-new-job-no-devices`,
- `test:smoke:mobile-worker-add-client`,
- `test:smoke:client-voice`,
- `test:smoke:admin-worker`,
- `test:smoke:version`.

## Build
- pełny lokalny build Vite nie został potwierdzony: w roboczym `node_modules` brakowało `vite/bin/vite.js`, więc kompilator nie wystartował,
- błąd wystąpił przed kompilacją kodu 9.20; statyczne testy regresyjne przeszły.

## Wdrożenie
- wystarczy wdrożyć aplikację przez `vercel.cmd --prod`,
- brak dodatkowego SQL i brak ponownego deploymentu Supabase Function.
