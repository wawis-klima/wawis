# WAWIS 12.35 — gotowa do wdrożenia

Naprawiono ponowienie SMS-a, który został przyjęty przez operatora, ale później oznaczony jako niedostarczony.

- kolejka rozpoznaje taki wpis jako „Niedostarczony” zamiast ogólnego „Błąd”,
- „Wyślij zaznaczone” dla takiego rekordu korzysta z kontrolowanej ścieżki retry, a nie z nowej wysyłki ręcznej blokowanej przez claim,
- serwer dopuszcza retry wyłącznie dla rekordu `error` z istniejącym `provider_message_id` i bez potwierdzonego doręczenia,
- frontend odczytuje treść błędu Edge Function zamiast pokazywać tylko „returned a non-2xx status code”,
- desktopowa karta klienta daje e-mailowi całą wolną szerokość, a telefon pozostaje kompaktowy po prawej stronie,
- na produkcji zbiorczo oznaczono jako usunięte 757 widocznych starych rekordów „Niewysłane”; bieżący niedostarczony SMS pozostawiono.

Migracja produkcyjna: `sms_retry_confirmed_undelivered_v1235`.
