# RELEASE RESULT

## Wersja
- 11.55

## Zakres
- mobilny podpis klienta: płynniejszy i dokładniejszy zapis ruchu palca
- Retina canvas minimum 2×
- Bézier smoothing + coalesced pointer events
- łagodnie zmienna grubość kreski
- zachowanie antyaliasingu przy eksporcie PNG
- bez zmian w PDF layout, Supabase, RLS i e-mailu

## Naprawa jakości
- wcześniejszy podpis łączył kolejne punkty prostymi odcinkami, przez co szybki ruch dawał kanciaste załamania
- 11.55 interpoluje ruch przez punkty pośrednie i krzywe kwadratowe
- szerokość kreski jest filtrowana, aby nie skakała między kolejnymi próbkami
- canvas zachowuje wysoką gęstość pikseli także na urządzeniach z niskim DPR
- przycinanie obrazu nie odcina delikatnych pikseli antyaliasingu

## Wynik wydania
- WAWIS PR checks: PENDING
- produkcyjny build: PENDING
- Vercel: PENDING
- merge: PENDING
