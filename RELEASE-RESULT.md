# RELEASE RESULT

## Wersja
- 13.34 (PR, przed zakończeniem produkcyjnego wdrożenia)

## Zmiana
- Mobile Cennik: stan początkowy wszystkich grup zwinięty; zawsze co najwyżej jedna grupa rozwinięta.
- Kliknięcie innej grupy zwija poprzednią, ponowne kliknięcie tej samej zwija ją.
- Bez zmian w 36 cenach, VAT, przyciskach menu, rolach, backendzie, PDF, PUSH.

## Weryfikacja przed wdrożeniem
- WAWIS PR checks: smoke Cennika, Playwright (administrator/pracownik), Closure Gate i build.
- Po zielonym CI: merge do main i potwierdzenie Vercel READY z tym samym SHA.
