# WAWIS 12.30 — gotowa do wdrożenia

Dodano bezpieczny, administracyjny SMS testowy w module SMS. Administrator podaje wyłącznie numer telefonu; treść wiadomości jest stała po stronie serwera. Test nie tworzy klienta, zlecenia ani wpisu w historii przypomnień serwisowych.

Wysyłka korzysta z tej samej Edge Function `send-service-sms`, konfiguracji nadawcy i tokenu SMSAPI co produkcyjne SMS-y. Tryb testowy nie rejestruje callbacku doręczenia, ponieważ nie tworzy claima ani logu serwisowego.

Walidacja: wymagane pełne regresje, E2E, build, deployment frontendu oraz nowa wersja Edge Function `send-service-sms`.
