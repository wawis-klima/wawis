# RELEASE RESULT

## Wersja
- 12.91

## Tryb
- mobile

## Podsumowanie
- Zmiana mobilnego wiersza ADRES: własny układ etykieta u góry, wartość pod etykietą, brak elipsy i redukcji fontu.
- E-mail, telefon, data oraz otwarcie linku Google Maps bez zmian.
- Dodano testy: `scripts/smoke-mobile-address-wrap-v1291.cjs` w grupie mobile oraz Playwright w `tests/e2e/mobile-v1104-contact-autofit.spec.js`.
- GitHub CI i mobile E2E: do zweryfikowania po uruchomieniu PR checks.
- Produkcyjny Vercel oraz wersja na telefonie: wymagają osobnego potwierdzenia; nie stwierdzono sukcesu przed otrzymaniem dowodu.

## Dowód
- Nie wolno uznać wdrożenia za ukończone, zanim testy i faktyczny build produkcyjny nie potwierdzą wersji 12.91.
