# RELEASE RESULT

## Wersja
- 11.80

## Zakres
- tylko mobile
- pełnoekranowy podgląd zdjęć
- desktop bez zmian funkcjonalnych

## Mobile photo zoom
- pinch-to-zoom 100–400%
- przesuwanie powiększonego zdjęcia jednym palcem
- podwójne stuknięcie: 250% / reset 100%
- przyciski − / + i procent zoomu
- reset zoomu przy zmianie zdjęcia
- boczna nawigacja zdjęć aktywna przy 100%, wyłączona w trybie zoom
- nadal zablokowane przewijanie strony pod podglądem
- globalny zoom aplikacji pozostaje wyłączony

## Desktop
- `src/components/modals/PreviewModal.jsx` — bez zmian
- `src/styles.css` — bez zmian

## Regresje
- `scripts/smoke-mobile-photo-zoom-v1180.mjs`
- rozszerzony `tests/e2e/mobile-photo-two-sessions.spec.js`
- WAWIS PR checks: PENDING
- Playwright mobile: PENDING
- produkcyjny build: PENDING
- Vercel: PENDING
- merge: PENDING
