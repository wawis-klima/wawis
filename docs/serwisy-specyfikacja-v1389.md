# WAWIS — Serwisy i przeglądy, zaakceptowana specyfikacja (28.10.2026)

## Źródło prawdy i granice
- Produkcja startowa: 13.88, projekt GitHub wawis-klima/wawis, Supabase public.devices (751 urządzeń, 28.10.2026), public.contractors i montażowe job_protocols.
- Etap pierwszy dostępny WYŁĄCZNIE Administratorowi na iPhonie. Pracownicy nie widzą modułu, serwisów, zdjęć ani przydziałów. Baza RLS ma odmówić dostępu bez polegania na ukrytej zakładce.
- Zero przebudowy starych services, SMS, job_protocols, photo queue lub przebiegu montażu. Nie zmieniać dat montażu.
- Zachować identyczne kolory, typografię, interakcje, logo, druk Phomemo, wysyłkę i podpis jak WAWIS. Wersja mobilna kompaktowa, bez drugiej linii menu.

## Proces biznesowy
1. SMS jest wyłącznie powiadomieniem i historią wysyłek. Nie tworzy ani nie planuje serwisu, nie zawiera przycisku planowania ani przekierowania do formularza. Przeglądy tworzy się wyłącznie w module „Urządzenia”, po telefonicznym ustaleniu terminu.
2. Klient oddzwania; administrator wyszukuje go (początkowo pusta lista, wynik dopiero po wpisaniu fragmentu nazwiska, firmy, telefonu, adresu, modelu, numeru seryjnego). Jedna karta klienta, wiele urządzeń.
3. Administrator wybiera urządzenia, umówioną datę, ewentualną godzinę i uwagi; opcjonalnie przydziela jednego głównego i dodatkowych pracowników. Zlecenie może być całkowicie nieprzydzielone.
4. Termin oraz pracowników można zmieniać bez tworzenia kolejnego zlecenia. Zapisywać kto, kiedy i co zmienił, w tym pierwotny i rzeczywisty skład. Przełożenie terminu nie zmienia harmonogramu przypomnień.
5. W późniejszym, wyraźnie zatwierdzonym wydaniu pracownicy zobaczą wspólną listę WSZYSTKICH wolnych zleceń i mogą atomowo nacisnąć „Podejmij”. Dwóch równoczesnych kandydatów: jeden wygrywa, drugi widzi wyraźny komunikat. Możliwość dodania innych do ekipy.
6. Uproszczony przegląd per urządzenie: sześć podstawowych czynności, sprawne/usterka, uwagi; zdjęcie dobrowolne przy sprawnym i obowiązkowe przy usterce. Usterki muszą mieć przynajmniej jeden faktycznie zapisany plik >0 B.
7. Jeden protokół PDF na CAŁĄ wizytę z rezultatami każdego faktycznie wykonanego urządzenia; jeden obowiązkowy podpis klienta na iPhonie. Wizyta nie może stać się „Wykonana” przed podpisem, zapisaniem PDF i potwierdzeniem plików w Storage. Częściowo niewykonane urządzenia nie są oznaczane jako zrobione.
8. Po finalizacji historia zarówno w kliencie, jak i osobno na każdym urządzeniu. Osobna rzeczywista data wykonania. Cykle SMS nadal od daty montażu: pierwszy 11 miesięcy, następne +12 miesięcy bez przesunięcia na datę spóźnionego przeglądu. Nie wolno fałszować rzeczywistej daty wizyty.
9. Podpisany PDF zawsze archiwizować; e-mail wysyła się ręcznie z istniejącego mechanizmu po potwierdzeniu poprawnego adresu. Można otworzyć i wydrukować dokument tak jak protokół montażowy, w tym z iPhone/Phomemo. Powiadomienie push do administratora po potwierdzeniu finalizacji.
10. Bez nowego kalendarza. Lista zaplanowanych wizyt w module Urządzenia, uporządkowana wg daty.

## Status wydania 13.89 — PR #442 (NO-GO)
W gałęzi release/v13.89 przygotowano kod realizacji wizyt, zdjęć, podpisanego PDF, drukowania, ręcznej wysyłki e-mail, admin PUSH, historii zmian terminu, wyszukiwarki i desktopowej zakładki przeglądów. Planowanie jest wyłącznie w „Urządzeniach”. W module SMS NIE wolno umieszczać przycisku „Zaplanuj przegląd”, „Zaplanuj serwis” ani nawigacji prowadzącej do utworzenia wizyty.
Pracownicy celowo nadal nie mają dostępu, a wspólna lista podejmowania serwisów zostanie dopiero w późniejszym wydaniu po zgodzie właściciela.
Nie uruchomiono nowych funkcji ani migracji na produkcji. Nie zakończono pełnego testu E2E całej ścieżki ani testu iPhone/Phomemo. RELEASE-GATE.ready_for_main pozostaje false. Nie traktować samego przygotowania kodu jako zakończenia wdrożenia.


## Warunki GO przed produkcją
- Migrację odtwarza czysta, izolowana baza PostgreSQL testowa; testy RLS z rolą admin/pracownik/anon, żaden pracownik nie odczytuje danych etapu 1.
- Testy wyszukiwania: puste, 1 znak, nazwisko, telefon, adres, model, SN, grupa kilku jednostek, klient bez urządzeń, limit wyników, specjalne znaki.
- Testy umawiania: SMS bez wizyty, jedna/wiele jednostek, nieprzydzielone, główny+dodatkowi, zmiana terminu, odwołanie, brak duplikatu po ponowieniu.
- Testy bezpieczeństwa: obce urządzenie nie może być dopisane do wizyty klienta; admin może edytować, worker/anon nie; audyt przydziału trwały i niepodrabialny.
- Testy finalizacji: dokument 1 PDF dla 1/2/5 urządzeń, wykonanie częściowe, 6 czynności, usterka bez zdjęcia blokuje, usterka ze zdjęciem dopiero po Storage upload >0 B, podpis wymagany, utrata sieci w każdej fazie, brak fałszywego sukcesu, ponowienie bez duplikatu, PDF można pobrać/wydrukować/wysłać ręcznie.
- Historia: przegląd późny nie przesuwa dat kolejnego SMS, wynik 1 wizyty powiązany z każdym urządzeniem, identyfikator i snapshot przetrwają odświeżenie i ewentualny reimport.
- Istniejące E2E: montaże, zdjęcia/offline, protokoły, faktury, SMS, WebKit, wersja/cache/Closure Gate. Na realnym iPhonie administratora test 15–20 min.
- Produkcja Vercel tylko poprzez squash PR release/v13.89 → main po zielonych bramkach. Weryfikacja READY i public/app-version.json == numer wydania. Nie kasować lokalnej PWA ani zdjęć pracowników.
