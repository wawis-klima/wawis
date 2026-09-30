# RELEASE RESULT

## Wersja
- 11.92

## Zakres
- brak możliwości zakończenia zlecenia bez dodanego urządzenia JW/JZ
- mobile: zablokowany „Zakończ” i czytelny komunikat przy pustym montażu
- mobile: brak fałszywego zielonego komunikatu o komplecie tabliczek
- administrator może nadal pominąć zdjęcia tabliczek, ale dopiero po dodaniu urządzenia
- desktop i backend mają tę samą blokadę
- Supabase: zastosowana migracja require_device_before_completion_v1192
- bez zmian RLS, Storage i Edge Functions

## Kontrola regresji
- smoke nameplate finish: brak urządzenia blokuje admina i pracownika; urządzenie + brak zdjęć nadal pozwala adminowi zakończyć
- desktop nameplate verification: nowy backend guard jest przed admin bypass
- E2E mobile 10.91/10.92: zaktualizowane do reguły 11.92
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
