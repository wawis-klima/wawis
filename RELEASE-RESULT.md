# RELEASE RESULT

## Wersja
- 11.90

## Zakres
- mobile: naprawa freeze po wyjściu z protokołu
- mobile: wspólny licznik blokady body/html dla zagnieżdżonych modali
- mobile: Escape/onClose nie przeinicjalizuje już scroll-locka
- E2E: po podpisie i zamknięciu protokołu body/html muszą być odblokowane
- bez zmian bazy, RLS, PDF i Edge Functions

## Przyczyna
- protokół używa lockPagePosition, a ekran podpisu jest drugim AppModalem
- przy zmianach onClose/Signature React mógł posprzątać efekty w kolejności, która przywracała zapisane wcześniej position: fixed / overflow: hidden
- przeładowanie aplikacji resetowało style, dlatego usuwało freeze

## Kontrola regresji
- mobile protocol E2E rozszerzony o kontrolę body/html po zamknięciu protokołu
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
