# RELEASE RESULT - Wawis 9.36

## Wersja
- 9.36

## Zakres
- zwykłe zdjęcia montażu i tabliczki znamionowe mają osobne listy nawigacji w podglądzie,
- strzałki po otwarciu zdjęcia montażu nie przechodzą już do tabliczek,
- tabliczki otwierane przy JZ/JW pozostają w osobnej galerii tabliczek,
- poprawka obejmuje desktop i mobile.

## Supabase
- brak nowej migracji SQL,
- brak zmian Edge Functions,
- brak zmian zasad Storage i RLS.

## Kontrola
- `smoke-photo-preview-gallery-separation`: PASS,
- `smoke-nameplate-rendering`: PASS,
- `smoke-release-runner`: PASS,
- produkcyjny build Vite: PASS.

## Build lokalny
- produkcyjny build Vite: PASS,
- brak błędów kompilacji.
