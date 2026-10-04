# WAWIS 12.40 — gotowa do wdrożenia

Dodano opcjonalną uwagę do mobilnego protokołu klienta.

- przycisk „Dodaj uwagę (opcjonalnie)” jest domyślnie zwinięty i nie powiększa formularza bez potrzeby,
- pole ma limit 300 znaków i można je usunąć,
- zmiana uwagi unieważnia wcześniejszy podpis klienta,
- uwaga jest zapisywana w `job_protocols`, wraca po ponownym otwarciu i trafia do PDF,
- migracja `20261004092411_add_job_protocol_note_v1240.sql` została zastosowana na produkcyjnym Supabase.

Przed merge obowiązuje zielony `WAWIS PR checks / targeted-checks`.
