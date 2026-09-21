# RELEASE RESULT - Wawis 10.25

## Wersja
- 10.25

## Zakres
- Desktop / Paliwo: dodano edycję pojemności baku dla każdego samochodu przez przycisk „Ustaw baki”.
- Pojemność baku jest widoczna przy samochodzie w zestawieniu floty.
- Mobile: pole pojemności nie zajmuje miejsca, ale zapis tankowania respektuje pojemność ustawioną przez administratora.
- Tankowanie większe niż pojemność baku jest blokowane w aplikacji i dodatkowo po stronie bazy.
- Desktop: dodano wykrywanie nietypowo wysokiego spalania.
- Alarm pojawia się dopiero po co najmniej dwóch wcześniejszych wyliczonych interwałach i gdy ostatnie spalanie jest jednocześnie co najmniej 30% oraz 1,5 l/100 km powyżej wcześniejszej średniej ważonej.
- Nietypowe spalanie jest ostrzeżeniem, nie blokuje tankowania.

## Migracje / Supabase
- Nowa migracja: `supabase/setup-fuel-tank-capacity-v10.25.sql`.
- Dodaje `fuel_vehicles.tank_capacity_liters` oraz serwerowy trigger walidujący ilość paliwa.
- Brak zmian Edge Functions.
