# Release 8.24 — wynik pakietowania

Zakres:
- Desktop/admin: źródła z wersji 8.23.
- Mobile/telefon: źródła z wersji 7.91 skopiowane do `src/mobile791`.
- Wspólna widoczna wersja aplikacji: 8.24.

Sprawdzenia wykonane w sandboxie:
- weryfikacja wersji w plikach,
- build Vite x2 — OK,
- smoke: version UI — OK,
- smoke: desktop-only guard — OK,
- smoke: Supabase GRANT/RLS — OK,
- smoke: startup chunk — OK,
- smoke: lazy modules — OK,
- smoke: no services module — OK,
- kontrola zawartości ZIP bez `node_modules`, `dist`, `logs*`, `supabase/.temp` — do wykonania po spakowaniu.

SQL/GRANT:
- Nie dodano nowej migracji SQL w tej zmianie. Dodatkowo naprawiono istniejący `service-module-stage-1.sql`, dopisując jawny GRANT dla `public.service_orders`.
