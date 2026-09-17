# RELEASE RESULT

## Wersja
- 10.91

## Zakres
- Mobile — rozwinięta karta montażu nie może poszerzać viewportu nawet przy długim e-mailu, adresie ani zagnieżdżonych sekcjach szczegółów.
- Mobile admin — każda wymagana JZ/JW może zostać jawnie potwierdzona ręcznie bez zdjęcia; potwierdzenie można cofnąć.
- Zakończenie zlecenia przez administratora wymaga dla każdej wymaganej JZ/JW fizycznego zdjęcia albo istniejącego ręcznego potwierdzenia; pracownik nadal wymaga fizycznych zdjęć.
- Desktop — istniejące ręczne potwierdzanie tabliczek pozostaje bez zmian.
- Supabase — bez nowego schematu i bez nowego stagingu; 10.91 korzysta z istniejącej tabeli `nameplate_manual_verifications` i backendowego guardu wdrożonego w 10.90.

## Dowód RED → GREEN
- błąd produkcyjny 10.90 został zgłoszony na realnych kartach mobilnych, które po rozwinięciu wychodziły poza szerokość ekranu.
- 10.90 miała backendową obsługę ręcznych potwierdzeń, ale mobilny administrator nie miał kontrolek `Potwierdź ręcznie / Cofnij ręczne`, więc ścieżka nie była kompletna.
- `tests/e2e/mobile-v1091-regressions.spec.js`: PASS — długi e-mail/adres nie powoduje poziomego overflow na profilu iPhone 14.
- `tests/e2e/mobile-v1091-regressions.spec.js`: PASS — mobile zawiera jawne ręczne potwierdzanie JZ/JW oraz blokadę zakończenia do czasu zdjęcia albo potwierdzenia.
- istniejący `test:smoke:nameplate-finish-verification`: PASS — pracownik nadal nie może ominąć wymogu zdjęć, a backendowy guard administratora pozostaje aktywny.
- production build 10.91: PASS.

## Wdrożenie produkcyjne
1. finalny PR `release/v10.91` → `main` z obowiązkowym `WAWIS PR checks / targeted-checks`,
2. wymagane regresje i Playwright mobile muszą przejść na finalnym SHA,
3. production build musi przejść na finalnym SHA,
4. merge przez chroniony `main`,
5. Vercel SUCCESS dla dokładnego merge SHA,
6. post-deploy: potwierdzić `app-version.json=10.91`, cache Service Workera `wawis-app-shell-v10.91` i brak nowych błędów diagnostycznych.

## Warunek zamknięcia
10.91 zostaje zamknięta dopiero po zielonym finalnym PR, wdrożeniu Vercela i post-deploy read-backu. Na etapie tego dokumentu produkcja nadal pozostaje na 10.90.
