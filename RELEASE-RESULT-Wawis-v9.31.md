# RELEASE RESULT - Wawis 9.31

## Wersja
- 9.31

## Zakres
- niebieski przycisk `Odczytaj kody` czyta EAN/Code 128 i lokalnie szuka nadrukowanego kodu modelu Rotenso,
- funkcja nie używa OpenAI ani przycisku `Odczytaj przez AI`,
- `EO50Xo R17` uzupełnia `Rotenso`, `Elis 5,0 kW`, `5,0 kW` i JZ,
- SN pozostaje wynikiem wyłącznie dekodera kodu kreskowego,
- szeroki OCR dowolnych pól nie został przywrócony; lokalny silnik ma zakres tylko kodu modelu na desktopie.

## Supabase
- brak migracji SQL,
- brak zmian Edge Functions,
- brak zmian Storage i RLS.

## Kontrola
- parser wariantów `EO50Xo`, `EOSOXo` i `EO5OXo`: PASS,
- zgodność dwóch przebiegów modelu: PASS,
- realny odczyt etykiety z przesłanego zrzutu: dwa przebiegi `EOSOXo_R17` → `EO50Xo R17` → `Rotenso / Elis / 5,0 kW / JZ`: PASS,
- produkcyjny build Vite: PASS (242 moduły),
- regresja kodów, EAN/SN, AI, jakości tabliczek, uprawnień i wersji: PASS,
- `verify:release`: PASS.
