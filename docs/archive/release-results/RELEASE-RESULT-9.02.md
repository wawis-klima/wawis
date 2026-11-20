# RELEASE RESULT - Wawis 9.02

## Wersja
- 9.02

## Zakres
- pełny audyt oficjalnego katalogu 2026/2027 Systemy klimatyzacji Rotenso,
- 183 aktualne, unikalne EAN-y urządzeń klimatyzacyjnych,
- 31 zachowanych starszych rewizji i potwierdzonych aliasów,
- 214 kodów rozpoznawanych łącznie,
- wszystkie typy z głównego katalogu: split pokojowe, split komercyjne, jednostki multi HP/S/N-Line, agregaty Hiro oraz wspólne agregaty Unico,
- brak zmian funkcjonalnych w mobile, OCR, zdjęciach, komentarzach i klientach.

## Pliki wdrożeniowe
- `nameplate-product-catalog-full-current-v9.02.sql` - idempotentny seed 183 aktualnych pozycji do Supabase,
- `wawis-katalog-ean-rotenso-v9.02.csv` - pełny katalog 214 kodów,
- `ROTENSO-CATALOG-AUDIT-9.02.md` - zestawienie rodzin i zakresu audytu.

## Kontrola
- test katalogu EAN: PASS,
- 214 unikalnych kodów wbudowanych: PASS,
- 183 aktualne EAN-y: PASS,
- sumy kontrolne EAN-13: PASS,
- zgodność Xi/JW, Xo/JZ i Xm/JZ: PASS,
- `verify:release`: PASS po aktualizacji raportu,
- pełny build i Playwright: do potwierdzenia przez GitHub Actions.

## Wdrożenie
1. Jeżeli tabela katalogu nie istnieje, najpierw uruchomić `nameplate-product-catalog-v8.92.sql`.
2. Uruchomić `nameplate-product-catalog-full-current-v9.02.sql`.
3. Wdrożyć aplikację 9.02 i poczekać na zielone workflow.
