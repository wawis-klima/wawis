# RELEASE RESULT - Wawis 9.32

## Wersja
- 9.32

## Zakres
- niebieski przycisk `Odczytaj kody` korzysta lokalnie z całego katalogu modeli Rotenso,
- `ES50Xi R17` uzupełnia `Rotenso`, `Elis Silver 5,0 kW`, moc `5,0 kW`, JW i katalogowy EAN `5905567614293`,
- typowe pomyłki obrazu są korygowane wyłącznie przez dopasowanie do potwierdzonej pozycji katalogowej,
- numer seryjny pozostaje wynikiem wyłącznie prawdziwego kodu Code 128/39,
- OpenAI uruchamia się nadal tylko po ręcznym kliknięciu `Odczytaj przez AI`.

## Supabase
- brak migracji SQL,
- brak zmian Edge Functions,
- brak zmian Storage i RLS.

## Kontrola
- parser nadruku `ES50Xi R17` i typowych wariantów OCR: PASS,
- dopasowanie wszystkich 213 unikalnych kodów katalogowych: PASS,
- regresja EAN/SN, AI, lokalnego odczytu i katalogu: PASS,
- kontrola wersji: PASS,
- produkcyjny build Vite, 242 moduły: PASS.
