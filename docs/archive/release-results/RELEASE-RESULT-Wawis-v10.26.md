# RELEASE RESULT - Wawis 10.26

## Wersja
- 10.26

## Zakres
- Mobile / Pracownik: w menu są „Montaże” i „Paliwo”; pracownicy mogą od razu dodawać tankowania samochodów.
- Mobile / Administrator: usunięto „Urządzenia” z mobilnego menu. Moduł pozostaje bez zmian na desktopie.
- Mobile / Paliwo: pozostaje prosty formularz tankowania i historia; bez tabel floty, raportów i edycji administracyjnej.
- Paliwo: jeśli od poprzedniego tankowania minęło mniej niż 100 km, aplikacja pokazuje ostrzeżenie z kilometrami i litrami i wymaga potwierdzenia przed zapisem.
- Desktop / Paliwo: dodano raport miesięczny floty z wyborem miesiąca, liczbą tankowań, litrami, kilometrami i średnim spalaniem dla aut i całej floty.
- Desktop / Paliwo: administrator może poprawić błędnie wpisane litry i przebieg.
- Historia zachowuje pierwotnego autora i czas dodania. Korekty mają osobny audyt: pierwotne wartości, czas ostatniej korekty, administrator korygujący i liczba korekt.
- Serwerowa walidacja nie pozwala ustawić poprawionego przebiegu poza zakresem wynikającym z poprzedniego i następnego tankowania.
- Zachowano pojemności baków, wykrywanie nietypowego spalania i push do administratora po tankowaniu pracownika.

## Supabase
- Dodano migrację `supabase/setup-fuel-production-v10.26.sql`.
- `fuel_entries` otrzymało pola audytu korekt: `corrected_by`, `corrected_at`, `correction_count`, `original_liters`, `original_odometer_km`.
- Dodano triggery `fuel_entries_audit_correction_v1026` oraz `fuel_entries_validate_edit_odometer_v1026`.
- Nie zmieniano istniejących Edge Functions push.

## Weryfikacja
- `test:smoke:fuel-module` — PASS.
- `test:smoke:admin-worker` — PASS.
- `test:smoke:assignment-push` — PASS.
- `test:smoke:mobile-ui-copy` — PASS.
- `test:smoke:version` — PASS.
- Test serwerowy audytu korekty i blokady złej kolejności przebiegów — PASS; dane testowe usunięte.
- Składnia zmienionych plików JSX — PASS przez parser TypeScript.
- Pełny build Vite nie został wykonany, ponieważ lokalny katalog `node_modules` nie zawiera pakietu `vite`; nie jest to błąd kodu wersji.
