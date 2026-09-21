# RELEASE RESULT - Wawis 9.05

## Wersja
- 9.05

## Tryb
- mobile — poprawa naturalnego głosowego wprowadzania danych klienta,
- wspólny parser pozostaje zgodny z formularzem administratora na desktopie.

## Zakres
- nie trzeba wypowiadać nazw pól typu `telefon`, `e-mail`, `miasto` ani `ulica`,
- telefon jest wykrywany wyłącznie jako spójny 9-cyfrowy numer lub numer z prefiksem `+48`,
- cyfry numeru domu i lokalu nie mogą zostać doklejone do telefonu,
- parser rozumie naturalny układ `imię nazwisko ulica numer/lokal miejscowość e-mail telefon`,
- e-mail jest wykrywany po `małpa/@` i `kropka`, także gdy ostatnia litera lokalnej części jest rozdzielona przez Safari,
- Safari otrzymuje `maxAlternatives = 5`; aplikacja wybiera wariant najlepiej pasujący do struktury danych,
- niepełny e-mail nie jest zgadywany — pole pozostaje puste i użytkownik widzi ostrzeżenie,
- brak nowej migracji Supabase.

## Test regresyjny z realnego zgłoszenia
Tekst zwrócony przez Safari w 9.04:
`Piotr Wasik ulica Widna 19 przez 19 Zawiercie Wasik P @. Pl 606 606 909`

W 9.05 oczekiwany wynik:
- klient: `Piotr Wasik`,
- ulica: `Widna`,
- numer domu: `19`,
- numer lokalu: `19`,
- miejscowość: `Zawiercie`,
- telefon: `606 606 909`,
- e-mail: pusty, jeżeli Safari faktycznie zgubi literę domeny; aplikacja nie zgaduje danych klienta.

Naturalna wypowiedź bez nazw pól:
`Piotr Wasik Widna 19 przez 19 Zawiercie wasik p małpa e kropka pe el 606 606 909`

Oczekiwany e-mail: `wasikp@e.pl`, telefon: `606 606 909`.

## Kontrola
- test parsera głosowego, w tym dokładny tekst ze screena 9.04: PASS ×2,
- naturalny wariant bez nazw pól: PASS ×2,
- test wersji: PASS ×2,
- test wielu adresów kontrahenta: PASS ×2,
- test powiązania klient–zlecenie i automatycznego tworzenia kontrahenta: PASS ×2,
- kontrola mobilnych tekstów i kompatybilności regex: PASS ×2,
- `verify:release`: PASS ×2,
- pełny Vite build i Playwright: nieuruchomione lokalnie, ponieważ środowisko nie uzyskało odpowiedzi z `registry.npmjs.org` podczas instalacji zależności; blokada nastąpiła przed kompilacją kodu.

## Wdrożenie
- brak SQL do uruchamiania,
- wdrożyć aplikację 9.05 standardowym workflow Vercel.
