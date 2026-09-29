# RELEASE RESULT

## Wersja
- 11.80

## Zakres
- tylko mobilny pełny podgląd zdjęć
- desktopowy podgląd zdjęć bez zmian
- bez zmian Supabase, RLS, Storage i Edge Functions

## Mobile photo zoom
- pinch-to-zoom od 100% do 400%
- po powiększeniu zdjęcie można przesuwać jednym palcem
- podwójne stuknięcie przełącza 100% ↔ 250%
- przyciski − / + zmieniają zoom co 50%
- środkowy wskaźnik procentowy resetuje do 100%
- po zmianie zdjęcia zoom i przesunięcie resetują się
- podczas zoomu boczne strefy poprzednie/następne są wyłączone, żeby pan nie zmieniał zdjęcia
- strona pod modalem pozostaje zablokowana tak jak od 11.19

## Ochrona desktopu
- `src/components/modals/PreviewModal.jsx` nie został zmieniony
- w `mobile791` zoom aktywuje się tylko dla `max-width:700px`
- dla szerszego viewportu komponent renderuje dotychczasowy podgląd bez nowych kontrolek
- nowe style zoomu są opakowane w `@media(max-width:700px)`

## Kontrola regresji
- `scripts/smoke-mobile-photo-zoom-v1180.mjs`
- istniejący E2E dwóch sesji został rozszerzony o widoczność kontrolek i zmianę 100% → 150% → 100%
- pełne WAWIS PR checks / Playwright / build: PENDING
- Vercel: PENDING
- merge: PENDING
