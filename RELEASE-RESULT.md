# RELEASE RESULT — WAWIS 13.91

## Zakres
- W mobilnym serwisie data i godzina mieszczą się w dwóch polach także na wąskich ekranach iPhone.
- Usunięty dropdown „Główny serwisant” wraz z „Bez przydziału — do podjęcia w przyszłości”.
- Jeden zestaw checkboxów pracowników w planowaniu i edycji; pierwszy zaznaczony jest głównym, kolejne osoby dodatkowymi, pusty wybór oznacza brak przydziału.
- Bez zmian uprawnień, modułu SMS, montażów, backendu i danych produkcyjnych.

## Kontrole
- Test wizualny układu daty i godziny na szerokościach 320, 360, 375, 390 i 430 px.
- Smoke test wyboru serwisantów i usunięcia dropdownu.
- Wymagane zielone WAWIS PR checks / targeted-checks oraz Closure Gate przed scaleniem.
- Po wdrożeniu kontrola Vercel READY i wersji 13.91.

## Status
Dopuszczenie do publikacji wyłącznie po zielonym CI.
