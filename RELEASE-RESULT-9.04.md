# RELEASE RESULT - Wawis 9.04

## Wersja
- 9.04

## Tryb
- mobile — stabilizacja głosowego wprowadzania danych klienta na iPhonie,
- wspólny komponent głosowy pozostaje zgodny także z formularzami desktopowymi.

## Zakres
- pełne dyktowanie działa jako sesja kończona ręcznie przyciskiem `Zakończ i sprawdź`,
- Safari może zakończyć pojedynczy fragment wypowiedzi, ale aplikacja automatycznie uruchamia kolejny fragment i łączy tekst w jedną całość,
- podczas dyktowania wyświetlany jest tekst `Usłyszano do tej pory`,
- parser rozumie adres `19 przez 19` jako `19/19` i potrafi oddzielić następującą po nim miejscowość,
- dodano e-mail do pełnego dyktowania oraz mikrofon przy polu e-mail,
- mówiony e-mail obsługuje m.in. `małpa`, `kropka` i literowane `pe el`,
- pojedyncze mikrofony nie są ponownie uruchamiane przed zakończeniem poprzedniej instancji,
- brak nowej migracji Supabase.

## Test regresyjny z realnego zgłoszenia
Fraza:
`Piotr Wasik ulica Widna 19 przez 19 Zawiercie wasik małpa e kropka pe el telefon 606 606 909`

Oczekiwany wynik:
- klient: `Piotr Wasik`,
- ulica: `Widna`,
- numer domu: `19`,
- numer lokalu: `19`,
- miejscowość: `Zawiercie`,
- e-mail: `wasik@e.pl`,
- telefon: `606 606 909`.

## Kontrola
- test parsera głosowego: PASS,
- realny przypadek `19 przez 19`: PASS,
- mówiony e-mail: PASS,
- obecność sesji ręcznie kończonej: PASS,
- automatyczne łączenie fragmentów Safari: kontrola kodu PASS,
- powiązanie głosowego e-maila z formularzem montażu i kontrahenta: PASS,
- pełny build i Playwright: do potwierdzenia po dostępnej instalacji zależności npm / przez GitHub Actions.

## Wdrożenie
- brak SQL do uruchamiania,
- wdrożyć aplikację 9.04 standardowym workflow Vercel.
