# RELEASE RESULT - Wawis 10.23

## Wersja
- 10.23

## Zakres
- Po udanym zapisaniu tankowania przez pracownika aplikacja wysyła push do administratora.
- Powiadomienie ma tytuł „Zatankowano samochód” i zawiera nazwę pracownika, samochód / numer rejestracyjny, ilość paliwa i stan licznika.
- Tankowanie wykonane przez administratora nie generuje push.
- Wysyłka korzysta z nowej, odseparowanej Edge Function `send-fuel-entry-push`; istniejąca `send-assignment-push` pozostaje bez zmian.
- Backend potwierdza aktywną sesję oraz zgodność `fuel_entries.created_by` z zalogowanym pracownikiem.
- `push_delivery_log` z typem `fuel_entry:<id>` zabezpiecza przed podwójną wysyłką tego samego tankowania.
- Awaria push nie cofa zapisu tankowania i jest zapisywana w diagnostyce klienta.
- Brak nowej migracji SQL.
- Edge Function `send-fuel-entry-push` wymaga wdrożenia do produkcyjnego projektu Supabase.
- Cache service workera: `wawis-app-shell-v10.23`.
