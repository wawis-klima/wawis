# RELEASE RESULT

## Wersja
- 10.94

## Zakres
- Przywrócenie szczegółowej treści PUSH dla zdarzeń związanych ze zleceniami.
- Zakończenie zlecenia: tytuł wskazuje wykonawcę, a treść klienta, adres i godzinę.
- Przydzielenie montażu oraz komentarz zachowują przygotowaną przez backend szczegółową treść zamiast stałego komunikatu ogólnego.
- Bez zmian schematu bazy, RLS i logiki uprawnień.
- Ochrona PUSH po stronie Service Workera nadal sprawdza odbiorcę i generację subskrypcji przed pokazaniem powiadomienia.

## Dowód problemu
Backend przygotowywał poprawną szczegółową treść, ale `sendPushToUsers` zastępował ją stałym komunikatem:
`Masz nowe zdarzenie w aplikacji Wawis. Otwórz aplikację, aby zobaczyć szczegóły.`

## Warunek GREEN
- smoke zakończenia zlecenia potwierdza, że payload używa szczegółowej treści,
- regresje PUSH i bezpieczeństwa muszą przejść,
- produkcyjny build musi przejść,
- wymagany `WAWIS PR checks / targeted-checks` musi być zielony,
- po merge Edge Function `send-assignment-push` musi zostać wdrożona do produkcyjnego Supabase,
- produkcyjny Vercel dla commita `main` musi zakończyć się sukcesem.

## Status
Kandydat 10.94 przygotowany do bramki PR.
