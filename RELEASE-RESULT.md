# RELEASE RESULT

## Wersja
- 11.20

## Tryb
- full / stability

## Zakres
- mobile: prawidłowa klasyfikacja retry/sukces/błąd miniaturek
- desktop admin: status PUSH całego zespołu w Diagnostyce
- Supabase: 13 optymalizacji RLS, 3 usunięte duplikaty indeksów, ograniczone granty funkcji triggerowych
- dokumentacja: stan 11.20 i bieżąca treść PUSH po tankowaniu

## Kryteria wydania
- retry miniatury nie może być raportowany jako końcowy ERROR
- końcowy ERROR miniatury dopiero po nieudanym fallbacku do oryginału
- administrator widzi stan PUSH zespołu, pracownik nadal tylko własne rekordy subskrypcji
- Supabase Advisor: brak `auth_rls_initplan` i brak `duplicate_index`
- `reject_zero_byte_photo_storage()` nie jest wykonywalna przez anon/authenticated
- wymagane: zielony WAWIS PR checks / targeted-checks oraz produkcyjny build
