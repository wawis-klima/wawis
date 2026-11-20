# RELEASE RESULT - Wawis 9.13

## Wersja
- 9.13

## Zakres
- desktopowa lista **Montaże** ma nową kolumnę **Tabliczki** pomiędzy `Monter` i `Data montażu`,
- zielone **Potwierdzone** oznacza zatwierdzenie wszystkich oczekiwanych JZ/JW,
- czerwone **Niepotwierdzone** pokazuje licznik, np. `1/2`,
- neutralne **Brak urządzeń** jest pokazywane, gdy montaż nie ma jeszcze jednostek/tabliczek do oceny,
- administrator może użyć **Potwierdź ręcznie** dla konkretnej JZ/JW także wtedy, gdy zdjęcia tabliczki nie ma,
- ręczne potwierdzenie można cofnąć,
- ręczne potwierdzenie jest osobnym rekordem i nie udaje istnienia zdjęcia,
- status ze zdjęcia (`photos.ocr_status = approved`) i ręczne potwierdzenie są równorzędne wyłącznie dla administracyjnego statusu desktopowego,
- mobile nie korzysta z ręcznych potwierdzeń i nadal wymaga fizycznych zdjęć tabliczek przed zakończeniem montażu.

## Migracja Supabase
Przed użyciem ręcznego potwierdzania uruchom w Supabase SQL Editor:
- `nameplate-manual-verifications-v9.13.sql`

Migracja tworzy `public.nameplate_manual_verifications`, unikalność `job_id + device_index + unit_ref`, indeks po `job_id` oraz admin-only RLS dla SELECT/INSERT/UPDATE/DELETE. Skrypt jest idempotentny.

## Kontrola wykonana lokalnie — 2 przebiegi PASS
- `test:smoke:desktop-nameplate-verification-status`,
- podstawowy `test:smoke` / `smoke-auth-refresh`,
- `test:smoke:desktop-jobs-layout-width`,
- `test:smoke:desktop-job-details-polish`,
- `test:smoke:nameplate-finish-verification`,
- `test:smoke:desktop-nameplate-ai-barcode`,
- `test:smoke:nameplate-product-catalog`,
- `test:smoke:version`,
- `test:smoke:release-runner`,
- `test:smoke:desktop-refresh`,
- `test:smoke:lazy-details`,
- `test:smoke:realtime-lite`,
- `test:smoke:selection`,
- `test:smoke:desktop-only`,
- `test:smoke:desktop-cross-module-panels`,
- `test:smoke:device-save`,
- `test:smoke:job-multi-indoor`,
- `test:smoke:job-device-type-switch`,
- `test:smoke:desktop-nameplate-ean-separation`,
- `test:smoke:desktop-nameplate-universal-reader`,
- `test:smoke:desktop-nameplate-layout-profiles`,
- `verify:release`.

Dodatkowo parser TypeScript potwierdził poprawną składnię wszystkich zmienionych plików JS/JSX.

## Build / Playwright
- `npm ci --ignore-scripts --no-audit --no-fund` zatrzymał się przed kompilacją na błędzie infrastruktury rejestru: E404 dla `yallist-3.1.1.tgz` przekierowanego przez wewnętrzny gateway,
- z tego powodu lokalny Vite build i Playwright nie zostały uruchomione,
- błąd wystąpił podczas pobierania zależności, przed kompilacją kodu 9.13.

## Wdrożenie
1. Uruchom `nameplate-manual-verifications-v9.13.sql` w Supabase SQL Editor.
2. Wdróż aplikację 9.13 przez `vercel.cmd --prod`.
3. Na liście Montaże sprawdź kolumnę `Tabliczki`.
4. Dla jednostki bez zdjęcia użyj `Potwierdź ręcznie` i potwierdź zmianę statusu montażu na zielony po zatwierdzeniu wszystkich JZ/JW.
