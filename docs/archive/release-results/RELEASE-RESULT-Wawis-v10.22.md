# RELEASE RESULT - Wawis 10.22

## Wersja
- 10.22

## Zakres
- Desktopowy moduł Tankowania pokazuje średnie spalanie dla każdego samochodu w tabeli „Tankowania według samochodu”.
- Obliczenie zakłada tankowanie zawsze do pełna.
- Pierwszy wpis ustala przebieg początkowy i nie generuje wyniku spalania.
- Od drugiego wpisu zużycie jest liczone jako litry zatankowane przy bieżącym pełnym tankowaniu / dystans od poprzedniego tankowania × 100.
- Średnia historyczna jest ważona łącznym dystansem, a nie liczona jako zwykła średnia z wyników cząstkowych.
- Zbiorczy wiersz floty pokazuje średnią z wszystkich prawidłowych odcinków wszystkich samochodów.
- Mobile pozostaje bez zmian.
- Brak nowej migracji Supabase.
- Cache service workera: `wawis-app-shell-v10.22`.
