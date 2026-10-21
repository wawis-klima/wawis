# RELEASE RESULT

## Wersja
- 13.38 (przygotowanie — do potwierdzenia po CI i Vercel)

## Zakres
- Mobile / Cennik: wysokość białych kart grup Rotenso min. 44 px zamiast 48 px; padding pionowy 7 px zamiast 9 px.
- Wysokość długich dwuwierszowych nazw pozostaje elastyczna, bez obcinania.
- Bez zmian rozmiaru czcionki, liczników, przerw między kartami, danych, 36 cen, VAT, ról, protokołów, PUSH i backendu.

## Kontrola
- Smoke CSS + ceny i role; Playwright iPhone 320–430px (min. 44 px, padding 7 px, brak overflow, rozwijanie).
- Po zielonym CI: merge do main i Vercel READY z nowym SHA; potwierdzić aplikację 13.38.
