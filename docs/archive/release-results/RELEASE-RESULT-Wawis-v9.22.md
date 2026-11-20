# RELEASE RESULT - Wawis 9.22

## Wersja
- 9.22

## Zakres
- poprawiono faktycznie renderowany mobilny formularz nowego montażu, bez polegania wyłącznie na końcowym `@media`,
- `Komentarz administratora` używa teraz `voiceFieldRow` — tego samego układu, który na iPhonie poprawnie ustawia mikrofon po prawej przy Miejscowości i Ulicy,
- mikrofon komentarza ma stałą kolumnę 44 px po prawej stronie pola,
- przy pustym komentarzu ukrywane jest `Wyczyść komentarz`, a przy pustej dacie `Wyczyść datę`,
- data ma osobny shell z zaokrągleniem i `overflow:hidden`; natywny input daty nie używa już ogólnej klasy `.input`,
- instalatorzy pozostają niewidoczni przy tworzeniu i dostępni przy późniejszej edycji.

## Supabase
- brak nowej migracji SQL,
- brak zmian Edge Function.

## Kontrola lokalna
- test `test:smoke:mobile-new-job-layout` sprawdza nowy układ JSX i ochronę CSS,
- regresja obejmuje wersję, komentarz głosowy 9.20, formularz bez urządzeń 9.16, dodawanie klienta przez pracownika 9.19 i push.

## Build
- pełnego builda Vite nie oznaczamy jako PASS, jeżeli zależności buildowe środowiska nie są dostępne; kontrola źródłowa i release verification są wykonywane niezależnie.
