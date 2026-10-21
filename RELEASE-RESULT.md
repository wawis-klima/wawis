# RELEASE RESULT

## Wersja
- 13.35 (przygotowanie — nie potwierdza wdrożenia)

## Zakres
- Mobilny Cennik: usunięto nagłówek „Cennik”, opis informacyjny i wyszukiwarkę.
- Na początku ekranu są bezpośrednio grupy modeli. Odstępy między kartami bez zmian.
- Zachowano 36 pozycji, VAT 8%, rozwijanie jednej grupy, menu admin 4 / pracownik 3.

## Wymagane kontrole
- CI WAWIS PR checks (regresje, smoke ceny, test mobilny dla ról i zwijania, Closure Gate, build).
- Następnie merge do main, Vercel READY z SHA merge i potwierdzenie wersji 13.35.
