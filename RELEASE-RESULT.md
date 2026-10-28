# RELEASE RESULT — WAWIS 13.89 (kandydat do wydania)

## Status: GOTOWOŚĆ WARUNKOWA — nie publikować przed zielonym CI i wdrożeniem backendu
Właściciel zatwierdził produkcyjne wydanie w celu samodzielnych testów na iPhonie. Scalenie PR #442 wyłącznie po zielonym CI/Closure Gate i przygotowaniu nowych schematów, prywatnego Storage oraz Edge Functions. Obecnie produkcja: 13.88.

## Kod przygotowany
- Mobilny administrator: wyszukiwarka grupująca klienta/urządzenia, umówienie, lista wizyt, przydział oraz jego historia.
- Wykonanie: sześć czynności i osobny wynik każdego urządzenia, rzeczywisty wykonawca, zdjęcia usterki (HEIC/JPEG), podpis i wspólny PDF.
- Prywatny Storage i serwerowa kontrola plików przed zamknięciem; historia klienta i urządzenia.
- Otwórz/drukuj protokół (istniejące mechanizmy Phomemo), ręczny e-mail z historią wysyłki.
- Desktop administrator: istniejący katalog urządzeń zachowany i osobna zakładka przeglądów.
- Moduł SMS jest wyłącznie do powiadomień i historii SMS: bez przycisku „Zaplanuj przegląd”, bez przekierowania i bez zakładania zlecenia. Planowanie tylko w „Urządzeniach”.
- W bazie: historia zmian terminu/statusu i przydziału; PUSH do admina dopiero po realnym zakończeniu.
- Pracownicy bez dostępu do serwisów (UI i RLS). Dotychczasowy harmonogram SMS bez zmian.

## Weryfikacja i kolejność operacji
- Zmiana z 28.10: serwer i formularz wymagają potwierdzenia wszystkich sześciu czynności przed zapisem wyniku urządzenia.
- Zielone pełne CI/Closure Gate i wszystkie E2E WebKit/zdjęcia/tabliczki dla aktualnego commita po ostatniej poprawce.
- Testy funkcjonalne nowej ścieżki end-to-end w izolowanym Supabase: PDF, podpis, zdjęcia HEIC/JPEG, offline, timeouty, RLS admin/pracownik.
- Test prawdziwego iPhone'a i drukarki Phomemo po kontrolowanym wdrożeniu, zgodnie z decyzją właściciela.
- Weryfikacja wdrożenia funkcji Edge Function oraz logów i PUSH na środowisku testowym.

Wdrożenie: najpierw nowe Edge Functions, potem wyłącznie nowe tabele/Storage/RLS/RPC z migracji, ich kontrola SELECT, na końcu scalenie przez PR i automatyczny deploy Vercel. Nie zmieniać SMS, istniejących montaży ani zdjęć pracowników.
