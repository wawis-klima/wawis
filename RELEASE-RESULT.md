# WAWIS 12.36 — gotowa do wdrożenia

Naprawiono dwie rzeczy w zakładce „Niewysłane”.

- stare wpisy `not_sent` zostały hurtowo oznaczone jako `deleted`, więc nie powinny już wracać do aktywnej zakładki,
- na produkcji pozostało **0** starych rekordów `not_sent` bez dowodu wysyłki,
- kliknięcie „Wyślij ponownie” ustawia „Wysyłanie…” tylko na konkretnym wierszu,
- pozostałe przyciski pozostają opisane normalnie; nadal są chwilowo zablokowane, żeby nie wysłać dwóch SMS-ów równocześnie.

Migracja: `20261003180500_sms_bulk_remove_old_unsent_v1236.sql`.
