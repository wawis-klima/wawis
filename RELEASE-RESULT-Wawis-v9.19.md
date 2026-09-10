# RELEASE RESULT - Wawis 9.19

## Wersja
- 9.19

## Zakres
- mobile administrator: Diagnostyka jest schowana pod przyciskiem `D` obok przeładowania zamiast zajmować osobny panel na pierwszym ekranie,
- menu `D` zawiera test push na bieżący telefon oraz pobranie raportu diagnostycznego,
- mobile administrator: do pola `Komentarz administratora` dodano natywne dyktowanie przez mikrofon,
- mobile pracownik: przycisk `+` pozwala dodać nowego klienta/zlecenie,
- nowe zlecenie utworzone przez pracownika ma zawsze status `Nowe`, `main_technician_id = null` i pusty komentarz administratora,
- pracownik-twórca otrzymuje jedynie dostęp przez `job_access`; administrator nadal decyduje, kto jest głównym monterem,
- pracownik nie dostaje dostępu do pełnego katalogu kontrahentów; bezpieczna funkcja RPC tworzy lub dopasowuje kontrahenta i zwraca tylko ID oraz dane wpisane przez pracownika.

## Supabase
- wdrożono w projekcie produkcyjnym funkcję `worker_create_or_get_contractor_for_job`,
- migracja źródłowa w paczce: `worker-create-contractor-v9.19.sql`,
- nie poluzowano istniejących polityk RLS tabeli `contractors`.

## Ważna decyzja dotycząca montera
- pracownik dodający klienta NIE jest automatycznie głównym monterem,
- `jobs.main_technician_id` pozostaje `NULL`,
- twórca jest tylko użytkownikiem z dostępem do zlecenia przez `job_access`,
- głównego montera wybiera później administrator.

## Kontrola
- `smoke-mobile-worker-add-client-v919.cjs` sprawdza obecność plusa pracownika, D diagnostyki, głosowego komentarza, bezpiecznego RPC i brak automatycznego przypisania głównego montera,
- regresja push 9.18 została zaktualizowana tak, aby kontrolowała działanie diagnostyki niezależnie od jej nowego schowania pod `D`.
