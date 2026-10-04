# WAWIS 12.39 — gotowa do wdrożenia

Poprawiono odporność startu aplikacji mobilnej na chwilowo wolny Supabase.

- lokalny snapshot pozostaje pierwszym źródłem widoku,
- lista montaży ma pierwszeństwo przed profilami, `job_access` i powiadomieniami,
- odczyt kursora synchronizacji nie może blokować startu przez kilka sekund,
- katalog kontrahentów ładuje się dopiero, gdy jest potrzebny,
- brak zmian w Supabase, Edge Functions i danych.

Przed merge obowiązuje zielony `WAWIS PR checks / targeted-checks`.
