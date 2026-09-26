# RELEASE RESULT

## Wersja
- 11.53

## Zakres
- mobilny protokół klienta: ustawienie dokładnej pozycji po `Uzupełnij protokół`
- docelowo 50 CSS px przed absolutnym końcem przewijania
- bez zmian w PDF, podpisie, Supabase, RLS i e-mailu

## Dowód
- pierwszy zrzut 11.52 i drugi ręcznie ustawiony zrzut różnią się pionowo o 123 px obrazu
- przy szerokości zrzutu 960 px odpowiada to około 50 CSS px na iPhonie
- 11.52 ustawiała maksymalny `scrollTop`; 11.53 ustawia `maxScrollTop - 50`

## Wynik wydania
- WAWIS PR checks: PENDING
- produkcyjny build: PENDING
- Vercel: PENDING
- merge: PENDING
