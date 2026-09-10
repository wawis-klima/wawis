# RELEASE RESULT - Wawis 9.23

## Wersja
- 9.23

## Zakres
- usunięto z formularza montażu pola `Zgoda na SMS` i `Aktywne przypomnienia`,
- `sms_consent` i `sms_reminder_enabled` są wymuszane jako `true` przy tworzeniu oraz zapisywaniu zlecenia,
- usunięto stały opis `Mów naturalnie, bez komend i bez podawania nazw pól`, aby zmniejszyć wysokość formularza,
- funkcja pełnego dyktowania, mikrofony przy polach i okno `Zakończ i sprawdź` pozostają bez zmian,
- historycznych wartości w bazie nie zmieniano hurtowo.

## Supabase
- brak nowej migracji SQL,
- brak zmian Edge Function.

## Kontrola lokalna
- dodano `test:smoke:mobile-new-job-sms-defaults`,
- regresja obejmuje formularz 9.22, komentarz głosowy, pracownika, push i wersję.

## Build
- pełny build Vite jest raportowany tylko wtedy, gdy lokalne zależności buildowe są dostępne; niezależnie wykonywana jest kontrola źródłowa i release verification.
