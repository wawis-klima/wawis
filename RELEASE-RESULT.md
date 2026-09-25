# RELEASE RESULT

## Wersja
- 11.50

## Zakres
- desktopowa lista Montaże: usunięcie nieaktualnego statusu tabliczek z cache
- poprawna pusta odpowiedź Supabase czyści nameplatePhotosMeta i nameplateVerifications
- bez zmian w Supabase schema/RLS oraz bez zmian w mobile

## Dowód błędu
- zgłoszony montaż w bazie ma brak urządzeń oraz 0 zdjęć tabliczek i 0 ręcznych potwierdzeń
- po ponownym logowaniu cache pokazywał Potwierdzone 2/2
- po otwarciu karty szczegółowy odczyt serwera poprawnie przełączał status na Brak urządzeń

## Naprawa
- pusta odpowiedź zbiorczego odczytu jest autorytatywna, gdy odczyt zakończył się poprawnie
- poprzedni status jest zachowywany wyłącznie podczas pending/unavailable
- dodana regresja 11.50 dla starego cache 2/2 → pusta odpowiedź serwera

## Wynik wydania
- WAWIS PR checks: PENDING
- produkcyjny build: PENDING
- Vercel: PENDING
- Cloudflare: PENDING
- merge: PENDING
