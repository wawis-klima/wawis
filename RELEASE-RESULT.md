# WAWIS 12.37 — gotowa do wdrożenia

Naprawiono przypadek, w którym SMS miał status `UNDELIVERED`, ale ponowienie było błędnie blokowane komunikatem „SMS dla tej grupy klienta został już wysłany”.

- wcześniejsza próba z `status=error` i `provider_message_id` nie jest już traktowana jako skutecznie wysłana,
- ochrona przed duplikatem nadal blokuje statusy `sent`, `provider_sent` i `delivered`,
- test transakcyjny na bieżącym wpisie Wojciecha Markowskiego zwrócił `ok=true`,
- webhook SMSAPI v11 zapisuje czytelny błąd zamiast całego callbacku,
- historia SMS formatuje starsze surowe błędy do krótkiego komunikatu.

Migracja: `20261003184000_sms_retry_after_undelivered_v1237.sql`.
