# RELEASE RESULT

## Wersja
- 11.88

## Zakres
- mobile: najpierw wybór sposobu płatności, potem kwota
- mobile: sposób płatności i kwota na pełnej szerokości, jeden pod drugim
- mobile: dla nowej płatności brak domyślnie zaznaczonej gotówki
- bez zmian bazy, RLS i PDF

## Zasady
- monter najpierw wybiera Gotówka albo Przelew
- poniżej wpisuje kwotę
- Gotówka nadal wymaga kwoty > 0
- Przelew nadal może być bez kwoty

## Kontrola regresji
- rozszerzony `scripts/smoke-mobile-protocol-v979.cjs`
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
