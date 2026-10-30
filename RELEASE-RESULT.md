# RELEASE RESULT — WAWIS 13.98

## Zakres
- Kosz serwisowy: usunięta nieaktualna instrukcja o wpisywaniu `USUN`; tekst opisuje jedno potwierdzenie. Sprzeczny tekst „PDF i zdjęcia pozostają bezpieczne” pokazywany tylko przy aktywnym serwisie.
- Historia: przy każdym urządzeniu klienta lista jego przeglądów; w szczegółach wizyty historia terminu, statusu, przydziału i wysyłek e-mail.
- Statusy `w_trakcie` i `oczekuje_na_podpis` wyświetlane poprawnie.
- E-mail z protokołem: widoczna historia wysyłek; po odmowie serwera nowa próba z nowym kluczem, po niepewnym wyniku ponowienie tylko po wyraźnym potwierdzeniu.

## Kontrola wydania
- Trwała regresja `scripts/smoke-service-admin-audit-v1398.mjs` wykonuje rzeczywisty kod modułów; RED odtworzony na module e-mail z 13.96.
- Bez zmian migracji, RLS, Storage, Edge Functions, PUSH, SMS i montaży. Odczyty historii korzystają z istniejących uprawnień SELECT administratora.
- CI/Closure Gate oraz status Vercel podlegają niezależnej weryfikacji przed zakończeniem.
