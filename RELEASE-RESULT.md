# RELEASE RESULT

## Wersja
- 11.98

## Zakres
- mobile: tylko jeden górny przycisk „Wprowadź głosowo”
- mobile: usunięte mikrofony przy Klient, e-mail, telefon, ulica, miejscowość i komentarze
- mobile: mniejsze pola NIP / miejscowość / kod pocztowy oraz pozostałe pola klienta
- mobile: automatyczny lookup kodu po 550 ms bez czekania na blur
- kod pocztowy reaguje od razu na wynik lookupu

## Kontrola regresji
- smoke: scripts/smoke-mobile-form-v1198.cjs
- smoke: scripts/smoke-postal-code-v1196.mjs
- Edge Function: postal-code-lookup ACTIVE v3
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
