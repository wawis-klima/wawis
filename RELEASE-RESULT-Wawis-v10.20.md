# RELEASE RESULT - Wawis 10.20

## Zakres
- Naprawiono pierwszy wpis przebiegu w module Paliwo/Tankowania.
- `last_odometer_km = null` nie jest już konwertowane przez interfejs do `0 km`.
- Pierwszy prawidłowy stan licznika jest przyjmowany bez kontroli różnicy względem zera.
- Od drugiego wpisu pozostają wszystkie zabezpieczenia z 10.19: brak cofania przebiegu, potwierdzenie skoku powyżej 2 000 km oraz wymóg zdjęcia powyżej 5 000 km.
- Nie ma nowej migracji Supabase: funkcja `private.validate_fuel_entry_odometer_v1019()` już wcześniej zwracała `new` bez kontroli, gdy poprzedni przebieg był `null`.
- Cache service workera podniesiono do `wawis-app-shell-v10.20`.

## Test regresji
- Scenariusz E2E zaczyna historię samochodu od 125 400 km bez zdjęcia.
- Smoke test pilnuje, aby `null` nie został ponownie zamieniony na `0 km`.
