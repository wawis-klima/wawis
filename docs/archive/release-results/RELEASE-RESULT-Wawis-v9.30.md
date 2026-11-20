# RELEASE RESULT - Wawis 9.30

## Wersja
- 9.30

## Zakres
- poprawiony odczyt kodów modeli Rotenso z pełnej transkrypcji AI,
- `EO50Xo R17` uzupełnia markę `Rotenso`, model `Elis 5,0 kW`, moc `5,0 kW` oraz typ jednostki zewnętrznej,
- kod modelu jest rozpoznawany także wtedy, gdy AI umieści go w `raw_text` lub `notes`, a nie w `model_code`,
- numer seryjny z Code 128 zachowuje pierwszeństwo.

## Supabase
- brak migracji SQL,
- brak zmian Edge Functions,
- brak zmian zasad Storage i RLS.

## Kontrola
- produkcyjny build Vite: PASS,
- test przypadku `EO50Xo R17`: PASS,
- separacja EAN / SN / model: PASS,
- uniwersalny czytnik kodów: PASS,
- odporność i jakość tabliczek: PASS.
