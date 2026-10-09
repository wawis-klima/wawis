# RELEASE RESULT

## Wersja
- 12.92

## Tryb
- mobile

## Podsumowanie
- Długie nazwy firm z jednoznaczną nazwą handlową wyświetlane skrótowo na mobilnych kartach (np. POWERMAT).
- Pozostałe nazwy maksymalnie dwie linijki; krótkie nazwy bez zmian.
- Wyszukiwanie, edycja klienta, protokoły i Fakturownia nadal korzystają z danych oryginalnych.
- Dodano testy smoke helpera i Playwright geometrii, hit-testu oraz wejścia w szczegóły.

## Infrastrukturę CI
- Dla obowiązkowego prawdziwego PostgreSQL 16 używane są publiczne mirrory obrazu Docker Official Image (ECR Public, zapasowo Google). Awaria obydwu nadal kończy test NO-GO — testów nie pomijamy.

## Dowód
- Kod i metadane gotowe do CI. Nie deklarować produkcyjnego sukcesu przed zielonym CI, merge i weryfikacją wdrożenia Vercel.
