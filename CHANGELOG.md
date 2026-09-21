Warning: truncated output (original token count: 78154)
Total output lines: 3158

## 11.06
- W kreatorze urządzeń krok pośredni ma teraz nazwę `Dalej do podsumowania`, a właściwy zapis `Zapisz urządzenia i tabliczki`, żeby pracownik nie pomylił przejścia między ekranami z zapisaniem zdjęć.
- Po udanym zapisie pojawia się jednoznaczne potwierdzenie, a kreatora nie można ręcznie zamknąć w trakcie zapisywania danych i tabliczek.
- Tabliczki nadal można zapisywać przy statusie `Nowe`; status `W trakcie` pozostaje wymagany dopiero do zakończenia montażu.
- Rozszerzono regresję kreatora mobilnego; bez zmian w Supabase, RLS, mechanizmie uploadu zdjęć i danych produkcyjnych.

## 11.05
- Mobilny przełącznik PUSH pokazuje zielone `ON` zgodnie z preferencją użytkownika, gdy iPhone ma przyznaną zgodę systemową, także podczas chwilowej synchronizacji lub automatycznej naprawy subskrypcji.
- Chwilowy brak pełnego stanu technicznego `ready` nie jest już błędnie przedstawiany jako ręczne `OFF`.
- Ręczne wyłączenie, brak konfiguracji, brak obsługi oraz systemowa blokada powiadomień nadal pokazują rzeczywisty stan `OFF`.
- Akcja przełącznika korzysta z tej samej interpretacji co jego wygląd, więc zielone `ON` wyłącza PUSH zamiast ponownie próbować go włączać.
- Dodano regresję `smoke-push-display-v1105.cjs`; bez zmian w Supabase, RLS, Edge Functions i danych produkcyjnych.

## 11.04
- E-mail i adres w mobilnych szczegółach są mierzone względem faktycznej szerokości kolumny danych.
- Czcionka pozostaje w normalnym rozmiarze, gdy wartość mieści się w jednym wierszu, i zmniejsza się płynnie wyłącznie przy przepełnieniu.
- Minimalny czytelny rozmiar wynosi 10,5 px; dopiero skrajnie długa wartość jest skracana wielokropkiem.
- Dopasowanie jest przeliczane po zmianie danych, załadowaniu fontów oraz zmianie szerokości ekranu.
- Dodano mobilny test Playwright weryfikujący zachowanie na profilu iPhone 14.
- Bez zmian w Supabase, danych klientów, rolach, PUSH i logice urządzeń.

## 11.03
- W zakończonym montażu komentarz administratora jest domyślnie zwinięty i można go rozwinąć jednym dotknięciem nagłówka.
- W aktywnych montażach komentarz administratora pozostaje od razu otwarty.
- E-mail i telefon są wyśrodkowane w prawej kolumnie danych.
- Dodatkowo zmniejszono wysokość wierszy e-mail, telefon, adres i data bez łamania wartości na kolejne linie.
- Dodano mobilną regresję Playwright sprawdzającą stan komentarza, wyśrodkowanie oraz rzeczywistą wysokość wierszy na profilu iPhone 14.
- Bez zmian w Supabase, danych klientów, rolach, PUSH, zdjęciach i logice urządzeń.

## 11.02
- Rozdzielono mobilny układ danych kontaktowych od układu dat, zamiast wymuszać jedną szerokość etykiety na wszystkich wierszach.
- Pełny adres e-mail otrzymał własną szerokość i rozmiar tekstu dopasowany do ekranu iPhone'a; pozostaje w jednej linii bez ucięcia.
- Etykietę `Data montażu` skrócono do `Data`, dzięki czemu nie łamie się na dwa wiersze.
- Zmniejszono wysokość i odstępy wierszy danych, pięciu kart urządzeń oraz przycisków pod listą.
- Bez zmian w Supabase, danych klientów, rolach, PUSH, zdjęciach i logice urządzeń.

## 11.01
- Poprawiono realny układ mobilnych szczegółów na szerokości iPhone'a po weryfikacji zrzutów z produkcji.
- Pełny adres e-mail mieści się w jednym wierszu zamiast kończyć wielokropkiem; zwężono kolumnę etykiet i dopasowano wielkość danych.
- Zmniejszono wysokość wierszy danych, kart urządzeń, odstępy między urządzeniami oraz przyciski akcji pod listą.
- Zagęszczono nagłówek i treść komentarza administratora bez zmiany danych ani logiki aplikacji.
- Zmiana jest CSS-only; bez zmian w Supabase, rolach, PUSH, protokołach i logice biznesowej.

## 11.00
- Zmniejszono pionowe odstępy i paddingi w mobilnych szczegółach montażu, aby karta zajmowała mniej miejsca bez utraty czytelności.
- E-mail, telefon i adres pozostają w jednym wierszu; przy skrajnie małej szerokości dłuższa wartość jest bezpiecznie skracana wielokropkiem zamiast łamać układ.
- Nazwa urządzenia, typ `Single-split`, strzałka i przycisk usuwania pozostają w jednym wierszu na typowych ekranach telefonu.
- Zagęszczono sekcje urządzeń, zdjęć, monterów, komentarzy i statusu z zachowaniem bezpiecznych pól dotykowych.
- Zmiana jest ograniczona do mobilnych szczegółów zlecenia; bez zmian w danych, Supabase, rolach, PUSH i logice biznesowej.

## 10.99
- Wyłączono PUSH w wersji desktopowej: desktop nie inicjalizuje już hooka PUSH ani nie pokazuje przełącznika.
- Wszystkie aktywne subskrypcje Windows na produkcji zostały bezpiecznie dezaktywowane; mobilne subskrypcje iPhone/Android pozostają bez zmian.
- Testowe powiadomienie z Diagnostyki desktopowej nadal może wysłać test do aktywnych urządzeń administratora, ale nie tworzy subskrypcji na komputerze.
- Dodano regresję `smoke-desktop-push-disabled-v1099.cjs` i zachowano mobilne ON/OFF z wersji 10.98.
- Bez zmian w RLS, schemacie danych i Edge Functions.

## 10.98
- Naprawiono mylący stan PUSH przy starcie aplikacji: aktywna subskrypcja nie jest już chwilowo pokazywana jako OFF tylko dlatego, że trwa pierwsza synchronizacja.
- Ostatni potwierdzony stan PUSH jest zapisywany per użytkownik i urządzenie w trwałym cache, więc po ponownym uruchomieniu aplikacji znany stan ON/OFF pojawia się od razu.
- Jeżeli urządzenie nie ma jeszcze żadnego potwierdzonego stanu, kontrolka pokazuje neutralne „…” / „PUSH · sprawdzanie” i jest chwilowo nieaktywna zamiast udawać OFF.
- Ręczne OFF z 10.97 nadal ma pierwszeństwo i jest pokazywane od razu; po każdej synchronizacji cache jest aktualizowany rzeczywistym stanem subskrypcji.
- Dodano regresję `smoke-push-initial-state-v1098.cjs`; bez zmian w Supabase, RLS i Edge Functions.

## 10.97
- Przycisk PUSH jest ponownie rzeczywistym przełącznikiem ON/OFF na telefonie i desktopie.
- Włączenie PUSH odbywa się wyłącznie po świadomym dotknięciu przycisku; usunięto automatyczne wymuszanie zgody przy pierwszym geście użytkownika.
- Wyłączenie dezaktywuje subskrypcję po stronie serwera oraz próbuje usunąć lokalną subskrypcję przeglądarki.
- Preferencja OFF jest zapisywana osobno dla użytkownika na danym urządzeniu i blokuje automatyczną samonaprawę PUSH po odświeżeniu.
- Ponowne ON tworzy lub synchronizuje subskrypcję i zachowuje dotychczasowe zabezpieczenia własności endpointu.
- Dodano regresję `smoke-push-toggle-v1097.cjs`; bez zmian w schemacie bazy, RLS i Edge Functions.

## 10.96
- Zdjęcia i tabliczki o rozmiarze 0 B są odrzucane po stronie aplikacji mobilnej i desktopowej przed zapisem rekordu.
- Dodano bazowy trigger, który blokuje INSERT/UPDATE `photos`, jeśli wskazany obiekt `job-photos` istnieje, ale ma 0 bajtów.
- Jeśli serwer wykryje pusty obiekt po uploadzie mobilnym, aplikacja próbuje usunąć uszkodzony obiekt i nie uznaje zdjęcia za zapisane.
- Oczyszczono 7 pustych rekordów, które miały prawidłowe zamienniki; pozostałe 6 pustych tabliczek w 5 zleceniach oznaczono do ponownego wgrania.
- Dodano regresję `smoke-photo-zero-byte-v1096.mjs` do grupy testów zdjęć.
- Bez zmian w RLS, rolach użytkowników i logice protokołów.

## 10.95
- Mobile, protokół klienta: po naciśnięciu `Drukuj lub wyślij` ekran automatycznie przewija się do rozwiniętej sekcji akcji, zamiast pozostawać w poprzednim miejscu.
- Sekcja `Drukuj lub wyślij` zachowuje odstęp nad przyklejonym dolnym paskiem, dzięki czemu `Drukuj protokół`, wysyłka e-mail i `Zapisz PDF w telefonie` są od razu widoczne.
- Dodano regresję E2E sprawdzającą, że po rozwinięciu sekcja akcji znajduje się nad dolnym paskiem.
- Bez zmian logiki generowania PDF, podpisu klienta, wysyłki e-mail, Supabase i uprawnień.

## 10.94
- PUSH zakończenia zlecenia pokazuje w tytule osobę, która je zakończyła, np. `Kacper Wydmański zakończył zlecenie`.
- Treść powiadomienia zawiera klienta, adres i godzinę zamiast ogólnego komunikatu „Masz nowe zdarzenie...”.
- Przydzielenia montaży i komentarze również zachowują przygotowaną szczegółową treść.
- Nadal działa ochrona odbiorcy oraz generacji subskrypcji w Service Workerze; nie zmieniono modelu uprawnień ani bazy danych.

## 10.93
- Mobile: przycisk `Potwierdź ręcznie` pod JZ/JW ma szerokość dopasowaną do treści, jest wyśrodkowany i zachowuje maksymalny limit szerokości ekranu.
- Zmiana jest CSS-only i korzysta ze ścieżki wydania MICRO UI; bez zmian logiki, Supabase, uprawnień ani danych.

## 10.92
- Produkcyjny mobilny entrypoint ładuje teraz faktyczne arkusze hardeningu szerokości 10.90/10.91 oraz końcowy guard 10.92; wcześniej poprawka 10.91 istniała w repo, ale nie była dołączona przez używany na telefonie `src/main.jsx`.
- Mobilna lista montaży ma wymuszoną kolumnę `minmax(0, 1fr)`, a rozwinięte szczegóły i komentarz administratora nie mogą zwiększyć szerokości viewportu.
- Administrator może zakończyć aktywne zlecenie bez zdjęć tabliczek znamionowych i bez ręcznego potwierdzania JZ/JW.
- Pracownik nadal musi posiadać komplet rzeczywistych zdjęć wymaganych tabliczek; backend egzekwuje ten warunek.
- Ręczne potwierdzanie tabliczek pozostaje opcjonalną funkcją administracyjną, ale nie jest warunkiem zakończenia przez administratora.
- Dodano kontrprzykłady RED 10.91 dla brakującego produkcyjnego importu CSS i admin-bypassu.

## 10.91
- Mobilna karta szczegółów nie może poszerzać viewportu nawet przy długim adresie/e-mailu.
- Administrator na mobile może jawnie potwierdzić ręcznie każdą JZ/JW bez zdjęcia i cofnąć potwierdzenie.
- Zakończenie zlecenia przez administratora wymaga dla każdej JZ/JW zdjęcia albo ręcznego potwierdzenia; pracownik nadal wymaga zdjęć.
- Dodano regresję Playwright dla overflow i kontraktu ręcznych potwierdzeń.

## 10.90
- Mobilne szczegóły montażu nie rozszerzają już ekranu przy długim adresie, e-mailu lub innych wartościach; treść zawija się wewnątrz karty.
- Administrator może z widoku mobilnego i desktopowego zakończyć aktywny montaż po ręcznym potwierdzeniu każdej brakującej tabliczki JZ/JW.
- Backend uznaje ręczne potwierdzenia wyłącznie dla administratora; pracownik nadal musi mieć rzeczywiste, zapisane zdjęcia wymaganych tabliczek.
- Dodano regresje blokujące powrót mobilnego overflow oraz obejście wymogu tabliczek przez pracownika.

## 10.89
- N7: repozytorium zawiera deterministyczny zestaw plików rebuild Supabase odtwarzający zweryfikowany backend stagingowy.
- Pracownik może odczytywać dane kontrahenta potrzebne do obsługi montaży.
- Pracownik może przez kontrolowaną ścieżkę montażu aktualizować nazwę klienta, telefon, e-mail oraz adres główny; dodatkowe adresy i pola administracyjne pozostają zachowane.
- Bezpośredni INSERT/UPDATE/DELETE tabeli contractors nie został otwarty dla pracownika; usuwanie kontrahenta pozostaje wyłącznie administracyjne.
- Dodano regresję pilnującą zakresu worker update i blokady bezpośrednich zapisów.



## 10.88
- N2: backendowy guard blokuje zakończenie zlecenia bez kompletnego zestawu tabliczek JW/JZ, również dla multi-split, i serializuje mutacje zdjęć z przejściem do statusu Zakończone.
- N3: zapis i zastępowanie protokołu używa własnej tożsamości operacji oraz CAS po oczekiwanym storage_path; konkurencyjna zmiana kończy się PROTOCOL_WRITE_CONFLICT zamiast fałszywego sukcesu.
- N4: jedna logiczna próba tankowania ma trwały UUID używany przez INSERT, reconciliation i retry, co eliminuje duplikaty po utraconej odpowiedzi lub reloadzie.
- N5: wysyłka protokołu e-mailem zachowuje trwały requestKey, stosuje timeout i Idempotency-Key oraz pojednuje niejednoznaczny wynik providera przed ponowieniem.
- Dodano RED→GREEN regresję na audytowanym SHA 10.84 i zaktualizowano historyczne testy tak, aby wymagały mocniejszych kontraktów CAS/idempotencji zamiast starego zachowania.

## 10.87
- F4: Service Worker jest trwałym źródłem porządku kontekstu PUSH; SET/CLEAR używają właściciela i ownership_generation, a spóźnione komendy starego konta nie mogą przywrócić A ani usunąć B.
- F10: getSubscription, subscribe i unsubscribe mają ograniczony czas zarówno na mobile, jak i desktopie; desktop ma dodatkowy guard generacji synchronizacji.
- F11: bezpośredni zapis push_subscriptions przez anon/authenticated został zastąpiony kontrolowanymi RPC; cleanup 404/410 zapisuje tombstone i sprawdza owner/lifecycle/generation przed dezaktywacją.
- N8: smoke-audit-fixes-v1087 najpierw odtwarza dokładne błędy z audytowanego SHA 10.84, a następnie wymaga kontraktu naprawionego 10.87.

## 10.86
- F3: spóźniona weryfikacja SIGNED_OUT nie może wylogować nowszej sesji — desktop i mobile.
- F5: restore/resume/upload kolejki zdjęć offline są izolowane właścicielem i generacją sesji.
- F8: requestId należy do faktycznego fetchu, nie do późniejszego caller-a dołączającego do Promise.
- F9: kursor synchronizacji przesuwa się dopiero po potwierdzonym trwałym snapshotcie; błąd zapisu pozostaje retryable.
- Regresja smoke-audit-fixes-v1086.mjs jest częścią obowiązkowej grupy infra.



## 10.85
- F12/N9: fail-closed Playwright runners, wymagany production build w PR gate, cross-platform ZIP i poprawki CRLF/Windows.
- N1: OCR AI ufa wyłącznie chronionej roli `profiles.role`.
- N6: uwierzytelniony callback SMSAPI, monotoniczne statusy i kontrola błędów zapisu.
- N7-A: repo zawiera baseline żywych guardów produkcyjnych oraz aktualny kod `send-service-sms`.

## 10.84
- F5: pojedyncze loadery summary/szczegółów i podpisywanie miniaturek używają tokenu generacji sesji; spóźniona odpowiedź konta A nie zmienia stanu konta B,
- F7: fallback polling odświeża również otwarte szczegóły zlecenia, więc zgubione zdarzenie Realtime komentarza lub zdjęcia zostaje naprawione bez ponownego logowania,
- F8: pełne i przyrostowe odświeżenia korzystają ze wspólnego monotonicznego numeru requestu; po każdym await starszy wynik jest odrzucany przed zmianą stanu lub kursora,
- F9: update kursora app-snapshots wykonuje GET i warunkowy PUT w jednej transakcji IndexedDB readwrite i nie może odtworzyć starego snapshotu,
- dodano regresję 10.84 oraz realny test Chromium wyścigu app-snapshots/kursora; wersja domyka F1–F13 ostatniego audytu.

## 10.83
- F12: obowiązkowa bramka PR uruchamia teraz rzeczywiste testy Playwright wskazane przez klasyfikator ryzyka, zamiast ograniczać się do testów konfiguracji,
- F3/F4: przełączenie konta i spóźnione operacje Auth/PUSH nie mogą przywrócić kontekstu poprzedniego użytkownika ani jego generacji,
- F10: lifecycle PUSH ma ograniczony czas wykonania i nie blokuje bez końca restore ani logout,
- F11: unieważnione lifecycle PUSH są zachowywane w prywatnej historii tombstone, dzięki czemu bardzo spóźniony sync nie może reaktywować starego właściciela endpointu,
- F6: push po tankowaniu zawiera recipientUserId i subscriptionGeneration, ma neutralną treść oraz wyłącza wygasły endpoint wyłącznie przy zgodności właściciela i generacji,
- dodano regresje A→B, timeout lifecycle, historię tombstone oraz realny Playwright mobile/desktop; finalny build produkcyjny jest częścią kontroli wydania.

## 10.82
- F1: bloker otwartego modala jest stabilny między rerenderami Reacta, a callback reloadu ponownie sprawdza aktywne blokady przed przeładowaniem,
- F2: formularz tankowania oraz komentarze desktop/mobile chronią realny draft i trwający zapis przed aktualizacją oraz zamknięciem karty,
- F13: beforeunload jest oddzielony od samego faktu otwarcia modala i działa tylko przy dirty/saving state,
- formularze montażu używają istniejącej detekcji zmian jako źródła warningu beforeunload, a czysty podgląd PDF nie ostrzega bez potrzeby,
- protokół zachowuje ochronę podczas edycji/podpisu/zapisu i czyści stan dirty po udanym zapisie,
- dodano regresję Node oraz rzeczywisty test Playwright obejmujący rerender formularza, późny bloker, paliwo i komentarz inline.

## 10.81
- dodano wspólny guard wymuszonego reloadu po zmianie wersji i Service Workerze,
- otwarty AppModal na mobile i desktop odracza aktualizację do bezpiecznego zamknięcia,
- protokół z podpisem oraz formularze montażu są chronione przed utratą niezapisanej pracy,
- po zamknięciu ostatniego modala oczekująca aktualizacja wykonuje dokładnie jeden reload,
- dodano regresję v10.81 dla wielu blockerów, beforeunload i odroczonego reloadu.

## 10.80
- Generacja sesji na mobile i desktop blokuje odpowiedzi wystartowane dla poprzedniego konta.
- Timeout mobilnego Supabase obejmuje odczyt body po otrzymaniu nagłówków HTTP.
- Aktualizacja operacji offline używa jednej transakcji IndexedDB `readwrite`.
- Dodano behawioralne regresje A→B i body-timeout oraz test Chromium wyścigu IndexedDB.

## 10.79
- Feed przyrostowy obejmuje wszystkie montaże widoczne dla każdego pracownika, także gdy nie jest przypisany do zlecenia.
- Automatyczne Nowe → Niezrealizowane po 30 dniach wykonuje baza przez Supabase Cron, a nie telefon podczas odczytu.
- Desktop i mobile nie wykonują już zapisu statusu przy ładowaniu listy.

## 10.78
- P0/F2: własność endpointu PUSH jest synchronizowana atomowo w PostgreSQL z advisory lock i blokadą aktywnego właściciela.
- P0/F3: każdy push ma odbiorcę i generację endpointu; Service Worker odrzuca wiadomości starego konta/generacji, a treść systemowa nie zawiera adresu ani danych klienta.
- P1/F4: logout unieważnia trwający sync, tworzy tombstone i spóźnione sync/disable nie mogą reaktywować ani wyłączyć endpointu nowego konta.
- P2/F9: pending cleanup ma trwałą kolejkę, backoff i retry przy loginie, online oraz healthcheck.
- P2/F10: dodano regresję 10.78 dla recipient/generation guard, durable retry oraz źródeł atomowego RPC; atomowy model DB został dodatkowo sprawdzony na produkcyjnym PostgreSQL w transakcji ROLLBACK.
- PUSH jest rejestrowany tylko w zainstalowanej aplikacji/PWA; zwykła przeglądarka nie tworzy nowych subskrypcji.
- Release: Google Drive i obowiązkowy ZIP usunięto z bramki; po merge blokuje wyłącznie zielony deployment Vercela, a live version/SW jest kontrolą pomocniczą.

## 10.77
- P0: po utraconej odpowiedzi/timeout zapisu protokołu pusty readback nie powoduje już usunięcia nowego PDF.
- P0: analogicznie zdjęcie licznika przy tankowaniu pozostaje w Storage przy niejednoznacznym wyniku INSERT.
- Dodano regresję odtwarzającą commit DB następujący dopiero po pustym readbacku dla PDF i paliwa.
- Zaktualizowano wcześniejszy test 10.74: bezpieczeństwo danych ma pierwszeństwo przed automatycznym cleanupem osieroconych plików.

## 10.76
- aplikacja mobilna dezaktywuje endpoint PUSH przed usunięciem sesji Auth i wykonuje lokalne `PushSubscription.unsubscribe()`,
- awaria sieci przy logout zapisuje minimalny retry w `localStorage`; po następnym logowaniu ten sam endpoint może przejść z konta A na B tylko przy zgodności endpointu, `p256dh` i `auth`,
- jeśli lokalny unsubscribe się udał, stare konto jest czyszczone po sieci zamiast przypisywania starego endpointu do nowego konta,
- desktop/przeglądarka nie są częścią tej zmiany,
- dodano test źródłowy i Playwright dla awarii sieci oraz przejścia A→B.

## 10.75
- Kolejka statusów i danych urządzeń zastępuje poprzednią operację w jednej transakcji IndexedDB; błąd zapisu wycofuje całość i pozostawia poprzedni wpis.
- Mobilny klient Supabase ma realny AbortController timeout: 45 s dla zwykłych requestów i 90 s dla Storage.
- Timeout i AbortError są traktowane jako przejściowy błąd sieciowy, więc synchronizacja oraz zdjęcia wracają do retry zamiast blokować sesję.
- Niejednoznaczny commit po zerwanym requestcie jest bezpieczny dzięki istniejącej idempotencji synchronizacji i uzgadnianiu zdjęć po stałej ścieżce Storage.
- Dodano regresję źródłową timeoutu oraz mobilny test Playwright z wymuszonym QuotaExceededError, który potwierdza rollback atomowej transakcji IndexedDB.

## 10.74
- Naprawiono zapis protokołów PDF: przy utraconej lub niejednoznacznej odpowiedzi po INSERT/UPDATE aplikacja najpierw odczytuje rekord i nie usuwa nowego pliku, dopóki nie potwierdzi braku zapisu.
- Przy zastępowaniu protokołu stary PDF jest usuwany dopiero po potwierdzeniu, że rekord wskazuje na nowy plik.
- Naprawiono analogiczny scenariusz zdjęcia licznika przy tankowaniu; uzgodnienie odbywa się po unikalnej ścieżce `odometer_photo_path`.
- Dodano test regresji v10.74 dla udanego commitu z utraconą odpowiedzią, błędu odczytu kontrolnego i jednoznacznie nieudanego zapisu.

## 10.73
- lewy skrajny odstęp mobilnego paska zmniejszono do 1 px; prawa krawędź pozostaje 2,5 px, a odzyskane miejsce zwiększa odstępy pomiędzy kontrolkami.

## 10.72
- skrajne odstępy mobilnego paska zmniejszono z 6 px do 2,5 px (około 60%); rozmiary ikon pozostają bez zmian, a odzyskane miejsce trafia pomiędzy kontrolki.
- realny test geometrii na profilu iPhone 14 potwierdza równe skrajne odstępy około 2,5 px oraz większe, równe przerwy wewnętrzne.

## 10.71
- skrajne odstępy mobilnego paska zmniejszono z 12 px do 6 px; ikony zachowują dotychczasowy rozmiar, a dodatkowa przestrzeń trafia pomiędzy kontrolki.

## 10.70
- mobilny górny pasek akcji używa deterministycznej siatki sześciu kolumn zamiast flex/space-between; realny test geometrii iPhone potwierdza równy odstęp po lewej i prawej stronie, w tym przy PW.
- Dodano rzeczywisty test Playwright na profilu iPhone 14, który mierzy lewy i prawy odstęp oraz równomierność przerw między elementami.

## 10.69
- mobilny pasek akcji ma prawy odstęp wymuszony na ramce nagłówka; PW jest odsunięte od prawej krawędzi bez zmiany odstępu samym marginesem przycisku.

## 10.68
- mobilny pasek akcji ma stabilny prawy margines; PW nie przylega do prawej krawędzi, a rozstaw elementów pozostaje równy.

## 10.67
- Mobile: prawy odstęp paska akcji ma 24 px, dzięki czemu przycisk PW jest wyraźnie odsunięty od prawej krawędzi.
- iPhone/PWA: aplikacja sprawdza produkcyjny app-version.json po powrocie z tła i automatycznie odświeża nowszą wersję.
- Vercel: automatyczne Preview są blokowane dla wszystkich gałęzi roboczych, także release/* i runner/*; automatyczny deploy pozostaje wyłącznie dla main.
- Vercel: dodatkowy guard odrzuca build, jeśli środowisko nie jest production albo commit nie pochodzi z main.
- Bezpieczeństwo wydania pozostaje wielowarstwowe: klasyfikacja FAST/TARGETED/CRITICAL, release gate, finalny ZIP, backup Drive i post-deploy evidence.

## 10.66
- iPhone/PWA: aplikacja sprawdza produkcyjne app-version.json po powrocie z tła i automatycznie przeładowuje nowszą wersję.
- Dodano cache-busting i cache: no-store dla kontroli wersji.
- Zachowano poprawkę 24 px prawego odstępu PW z 10.65.

## 10.65
- Mobile: prawy odstęp całego paska akcji zwiększono do 24 px, dzięki czemu PW jest wyraźnie odsunięte od krawędzi.
- Usunięto nieskuteczny dodatkowy margin samego PW; pozycję wymusza teraz padding kontenera.
- Zmiana wyłącznie CSS, profil FAST UI.

## 10.64
- Mobile: odsunięto przycisk inicjałów użytkownika (np. PW) o dodatkowe 6 px od prawej krawędzi paska akcji.
- Pozostałe przyciski, szerokości i układ jednej linii pozostają bez zmian.
- Zmiana dotyczy wyłącznie CSS mobile i korzysta z profilu FAST UI; bez zmian w danych, Supabase i logice aplikacji.

## 10.63
- Dodano automatyczny klasyfikator zmian porównujący gałąź release z produkcyjnym main.
- FAST UI obsługuje bezpieczne zmiany CSS i statycznych assetów: tylko mały zestaw smoke testów, jeden build, weryfikacja paczki i bez Playwrighta.
- TARGETED obsługuje zmiany funkcjonalne frontendu: uruchamia tylko powiązane grupy regresji i E2E dla właściwej platformy.
- CRITICAL obejmuje backend, Supabase, bezpieczeństwo, synchronizację, push i samą infrastrukturę wydawania: zachowuje pełne testy oraz E2E mobile i desktop.
- Finalny build, verify:bundle, verify:release, ZIP, backup Drive i kontrola produkcji pozostają obowiązkowe dla każdego produkcyjnego wydania.
- PR checks korzystają z tego samego klasyfikatora, więc kolejne drobne poprawki będą sprawdzane znacznie szybciej bez obniżenia kontroli krytycznych zmian.

## 10.62
- Dodano po 8 px wewnętrznego odstępu po lewej i prawej stronie jednoliniowego nagłówka mobilnego.
- Zmniejszono slot numeru wersji z 48 px do 40 px, czyli do szerokości standardowych przycisków paska.
- Inicjały użytkownika (np. PW) nie przylegają już do prawej krawędzi i cały pasek ma bardziej równy rytm.
- Dodano regresyjny smoke test pilnujący bocznych odstępów i szerokości pola wersji.
- Desktop, dane, Supabase i logika aplikacji pozostają bez zmian.

## 10.61
- Wprowadzono gałęzie release/v<WERSJA>; main jest przeznaczony wyłącznie dla gotowych wydań.
- PR uruchamia szybkie grupy regresji dobrane do zmienionych plików zamiast pełnego zestawu testów.
- Finalne wydanie wykonuje każdą grupę regresji, Playwright, build, verify i pakowanie tylko jeden raz.
- Regresje pogrupowano na jobs, photos, protocol, roles, push, fuel, nameplates oraz obszary platformowe.
- verify:release sprawdza integralność wydania zamiast historycznych fragmentów implementacji i literalnych tekstów UI.
- Vercel ma twardy deploy gate wymagający finalnego zielonego runu, zweryfikowanego ZIP na Google Drive i oznaczenia ready_for_main.
- Post-deploy tworzy dowód z rzeczywistego app-version.json, Service Workera i diagnostyki Supabase zamiast ręcznych flag true/false.
- Podbicie wersji automatycznie aktualizuje także cache Service Workera, a repo zawiera CODEOWNERS i instrukcję ochrony main.

## 10.60
- pracownik mobilny może edytować każdy aktywny montaż, także gdy nie jest do niego przypisany; przypisanie instalatora jest informacją organizacyjną, a nie blokadą dostępu,
- pracownik tworzący nowy montaż może od razu wybrać głównego technika i dodatkowych instalatorów,
- wszyscy pracownicy mogą w aktywnym montażu zmieniać dane robocze, dodawać komentarze i zdjęcia oraz zarządzać listą instalatorów,
- zakończone montaże pozostają zablokowane dla zwykłych pracowników, aby chronić podpisaną dokumentację i protokoły,
- RLS Supabase dla jobs/job_access oraz zdjęć i komentarzy korzystających z helperów dostępu został rozszerzony na cały zespół pracowników,
- push o przypisaniu i zakończeniu montażu nie wymaga już wcześniejszego przypisania wykonującego pracownika,
- dodano regresję testową test:smoke:worker-shared-job-edit.

## 10.59
- uzupełnij opis zmian dla wersji 10.59

## 10.58
- uzupełnij opis zmian dla wersji 10.58

## 10.57
- uzupełnij opis zmian dla wersji 10.57

## 10.56
- uzupełnij opis zmian dla wersji 10.56

## 10.54
- Mobile / nowy montaż: formularz jest wyraźnie bardziej kompaktowy; zmniejszono pola danych klienta, status, mikrofony, komentarz i przycisk zapisu.
- `Zamknij` i `Wprowadź głosowo` są obok siebie w jednym rzędzie.
- `Data montażu` ma zwarty poziomy układ z mniejszym polem daty i przyciskiem `Wyczyść`.

## 10.53
- Mobile / nowy montaż: pole komentarza jest zwykłym komentarzem autora montażu dla każdego twórcy, także administratora.
- Specjalny `Komentarz administratora` pozostaje tylko przy edycji istniejącego zlecenia przez administratora.

## 10.26
- Mobile / pracownik: moduł „Paliwo” jest produkcyjnie dostępny z menu obok „Montaże”; pracownik może dodawać tankowania i widzi własną historię.
- Mobile / administrator: usunięto moduł „Urządzenia” z mobilnego przełącznika; urządzenia pozostają dostępne na desktopie.
- Paliwo: dodano ostrzeżenie i wymagane potwierdzenie, gdy kolejne tankowanie następuje po mniej niż 100 km od poprzedniego przebiegu.
- Desktop / Paliwo: dodano raport miesięczny floty z liczbą tankowań, litrami, kilometrami i średnim spalaniem dla każdego samochodu oraz całej floty.
- Desktop / Paliwo: administrator może poprawić litry i przebieg błędnego tankowania.
- Korekta zachowuje pierwotnego autora i czas wpisu oraz zapisuje pierwotne wartości, czas korekty, osobę korygującą i liczbę korekt.
- Baza pilnuje, aby poprawiony przebieg nie był niższy od poprzedniego ani wyższy od następnego tankowania.

## 10.25
- Paliwo: pojemność baków ustawiana na desktopie dla każdego auta.
- Paliwo: blokada tankowania ponad pojemność baku po stronie aplikacji i Supabase.
- Paliwo desktop: ostrzeżenie o nietypowo wysokim spalaniu względem wcześniejszej średniej.

## 10.24

- Mobile / Paliwo: usunięto instrukcyjny tekst pod nagłówkiem „Tankowania”, aby odzyskać miejsce na ekranie.
- Desktop: tekst instrukcyjny pozostaje bez zmian.
- Brak zmian w logice zapisu tankowań, przebiegów, spalania i powiadomień push.

## 10.23
- Dodano push do administratora po udanym zapisaniu tankowania przez pracownika.
- Treść powiadomienia zawiera pracownika, samochód z numerem rejestracyjnym, ilość paliwa i stan licznika.
- Tankowanie zapisane przez administratora nie generuje powiadomienia.
- Wydzielono osobną Edge Function `send-fuel-entry-push`, aby nie zmieniać istniejącej funkcji powiadomień o montażach.
- Funkcja weryfikuje zalogowanego użytkownika oraz `created_by` wpisu tankowania i odrzuca próbę wysłania push dla cudzego wpisu.
- Log `fuel_entry:<id>` chroni przed ponownym dostarczeniem tego samego tankowania do administratora.
- Błąd wysyłki push jest diagnostyczny i nie cofa poprawnie zapisanego tankowania.
- Brak nowej migracji SQL; wymaga wdrożenia Edge Function `send-fuel-entry-push`.
- Service worker używa cache `wawis-app-shell-v10.23`.

## 10.22
- Dodano na desktopie kolumnę „Śr. spalanie” w tabeli „Tankowania według samochodu”.
- Spalanie jest liczone automatycznie przy założeniu, że każde tankowanie odbywa się do pełna.
- Pierwszy zapis przebiegu stanowi wyłącznie punkt początkowy; wynik spalania pojawia się od drugiego tankowania danego auta.
- Średnia jest ważona łącznym dystansem: suma litrów z kolejnych pełnych tankowań / suma przejechanych kilometrów × 100.
- Wiersz „Wszystkie samochody” pokazuje średnie spalanie całej floty liczone z prawidłowych odcinków poszczególnych aut.
- Wersja mobilna pozostaje bez zmian i nie pokazuje statystyk spalania.
- Brak nowej migracji Supabase.
- Service worker używa cache `wawis-app-shell-v10.22`.

## 10.21
- Na desktopie sekcja „1. Nowe tankowanie” jest domyślnie zwinięta, aby nie zajmowała miejsca, gdy administrator tylko przegląda historię.
- Dodano przycisk „Rozwiń/Zwiń” z `aria-expanded`; pełny formularz pojawia się dopiero po rozwinięciu.
- Mobile pozostaje bez zmian: formularz tankowania jest od razu rozwinięty.
- Nie zmieniono walidacji przebiegu ani danych Supabase.
- Service worker używa cache `wawis-app-shell-v10.21`.

## 10.20
- Naprawiono pierwszy zapis przebiegu dla samochodu: brak wcześniejszego stanu licznika nie jest już zamieniany na `0 km`.
- Pierwszy przebieg może być dowolnym prawidłowym stanem początkowym, np. 12 000 km, 100 000 km lub 125 400 km, bez kontroli różnicy względem zera.
- Od drugiego tankowania nadal działa blokada cofnięcia przebiegu, potwierdzenie większego skoku i wymóg zdjęcia przy różnicy powyżej 5 000 km.
- Backendowa walidacja już poprawnie pomijała kontrolę dla pierwszego wpisu, więc wersja 10.20 nie wymaga nowej migracji SQL.
- Service worker używa cache `wawis-app-shell-v10.20`.

## 10.19
- Zablokowano zapis przebiegu niższego niż ostatnia wartość danego samochodu.
- Skok powyżej 2 000 km wymaga dodatkowego potwierdzenia z pokazaniem poprzedniej wartości, nowej wartości i różnicy.
- Ręczny skok powyżej 5 000 km jest blokowany do czasu poprawienia wartości lub dołączenia zdjęcia licznika.
- Dodano bazowy, wspólny dla całej floty ostatni przebieg; pracownik korzysta z niego do walidacji, ale nadal nie widzi wpisów innych osób.
- Dodano zabezpieczenie bazy przed cofnięciem licznika i przed skokiem ponad 5 000 km bez zdjęcia.
- Administrator na desktopie widzi tabelę samochodów z liczbą tankowań, sumą litrów oraz ostatnim tankowaniem.
- Kliknięcie samochodu filtruje historię; zestawienie nie jest wyświetlane w aplikacji mobilnej.
- Service worker używa cache `wawis-app-shell-v10.19`.

## 10.18
- Dodano dwa sposoby podania przebiegu: domyślne wpisanie ręczne albo zdjęcie z odczytem OCR/OpenAI.
- Ręczny wpis tankowania nie wymaga zdjęcia i nie wykonuje zbędnej operacji w prywatnym magazynie plików.
- Historia rozróżnia wpis ręczny bez zdjęcia od ręcznej korekty wyniku widocznego na zdjęciu.
- Usunięto z widoku sekcję „Flota firmowa” służącą do dodawania i ukrywania pojazdów; istniejąca flota pozostaje na liście wyboru.
- Uporządkowano numerację widoku do dwóch sekcji: nowe tankowanie oraz historia tankowań.
- Nie zmieniono zasad dostępu: pracownik widzi własne wpisy, administrator wszystkie.
- Service worker używa cache `wawis-app-shell-v10.18`.

## 10.17
- Usunięto Diagnostykę z górnego menu aplikacji mobilnej; moduł pozostaje w desktopowym panelu administratora.
- Dodano flotę: Doblo `SZA 6149G`, Doblo `SZA 0673A`, Vivaro `SZA 60398`, podnośnik `EL 8GP61` i Master `KR 9UH22`.
- Udostępniono mobilny moduł Paliwo pracownikom.
- Pracownik może dodawać tankowania i odczytywać zdjęcia licznika wyłącznie we własnym katalogu.
- Reguły RLS ograniczają historię pracownika do wpisów utworzonych przez jego konto; administrator widzi całość.
- Tylko administrator może zarządzać flotą, edytować lub usuwać wpisy i usuwać dowody zdjęciowe.
- Widok administratora pokazuje nazwisko osoby tankującej, a widok pracownika jest opisany jako „Moje tankowania”.
- Service worker używa cache `wawis-app-shell-v10.17`.

## 10.16
- Dodano lokalny OCR licznika uruchamiany przed połączeniem z OpenAI.
- Lokalny wynik jest uznawany tylko po wykryciu oznaczenia ODO/TOTAL oraz zgodnym odczycie w wielu przebiegach lub wyjątkowo wysokiej pewności.
- Odczyty TRIP, pojedyncze wyniki o zwykłej pewności oraz nieczytelne zdjęcia automatycznie przełączają analizę na OpenAI.
- Lokalny OCR ma 30-sekundowy limit czasu, dzięki czemu nie może bezterminowo zablokować formularza.
- Formularz pokazuje bieżący etap analizy oraz źródło zaakceptowanego wyniku: OCR, OpenAI albo korekta.
- Źródło odczytu jest zapisywane przy tankowaniu i pokazywane w historii.
- Service worker używa cache `wawis-app-shell-v10.16`.

## 10.15
- Zastąpiono domyślne ręczne pole przebiegu zdjęciem licznika wykonywanym aparatem telefonu.
- Dodano odczyt AI, który akceptuje wyłącznie główny licznik ODO/TOTAL, a odrzuca licznik dzienny TRIP i niejednoznaczne ujęcia.
- Przed zapisem wyświetlane są zdjęcie, odczytana liczba kilometrów i pewność rozpoznania; użytkownik musi je wizualnie potwierdzić.
- Pozostawiono awaryjną korektę błędnego odczytu, oznaczaną zerową pewnością AI.
- Zdjęcia licznika są kompresowane i zapisywane w prywatnym bucketcie z RLS wyłącznie dla administratora.
- Historia tankowań pozwala otworzyć dowód zdjęciowy za pomocą krótkotrwałego podpisanego adresu.
- Dodano diagnostykę modułu `fuel` dla odczytu, zapisu i otwierania zdjęcia oraz test regresyjny zabezpieczeń.
- Service worker używa cache `wawis-app-shell-v10.15`.

## 10.14
- Dodano testowy moduł `Tankowania` dostępny wyłącznie dla administratora na telefonie i komputerze.
- Formularz zapisuje numer rejestracyjny, ilość paliwa i pełny stan licznika, a dokładną datę i godzinę nadaje automatycznie serwer.
- Administrator może sam dodać numery rejestracyjne do listy testowej oraz czasowo ukrywać pojazdy na liście wyboru.
- Dodano historię 100 ostatnich tankowań z możliwością usuwania wpisów testowych i kontrolą, aby licznik nie cofał się względem poprzedniego zapisu.
- Utworzono osobne tabele `fuel_vehicles` i `fuel_entries` z walidacją danych, indeksami oraz RLS blokującym każdą operację osobom bez roli administratora.
- Błędy modułu trafiają do diagnostyki z oznaczeniem modułu `fuel`; udany zapis nie jest oznaczany jako błąd.
- Dodano test regresyjny dostępu, automatycznego czasu, walidacji i zabezpieczeń bazy.
- Service worker używa cache `wawis-app-shell-v10.14`.

## 10.13
- Poprawiono klasyfikację błędów i ostrzeżeń, aby jeden wpis nie był liczony w obu kategoriach.
- Usunięto fałszywe alarmy powodowane przez techniczne pola udanych operacji, np. `failedCount: 0`.
- Identyczne zdarzenia są grupowane i pokazywane z liczbą powtórzeń, np. `console.warn ×4`.
- Domyślny widok oraz liczniki obejmują ostatnie 24 godziny, a starsze wpisy są dostępne w zwijanej historii.
- Każde nowe zdarzenie zapisuje wersję aplikacji, platformę i techniczny moduł źródłowy bez danych klienta.
- Dodano bezpieczną migrację pola `diagnostic_module` oraz zgodność aplikacji ze starszym schematem podczas wdrażania.
- Dodano test regresyjny klasyfikacji, grupowania, zakresu czasu i rozpoznawania modułów.
- Service worker używa cache `wawis-app-shell-v10.13`.

## 10.12
- Dodano automatyczne ponowne podpisanie linku miniatury po błędzie jej załadowania.
- Niedziałający link jest usuwany z pamięci aplikacji i `sessionStorage`, aby nie wracał przy kolejnej próbie.
- Jeśli ponowiona miniatura również nie działa, aplikacja używa podpisanego linku do oryginalnego zdjęcia.
- Po nieudanym odzyskaniu pozostaje klikalny przycisk otwierający pełne zdjęcie zamiast stale uszkodzonej ikony obrazka.
- Dodano ciche zdarzenie diagnostyczne `photo.thumbnail.load.failed` z etapem odzyskiwania i liczbą prób, bez danych klienta.
- Dodano test regresyjny pamięci podpisanych URL-i, wymuszonego odświeżenia i podłączenia fallbacku w mobilnym widoku.
- Service worker używa cache `wawis-app-shell-v10.12`.

## 10.11
- Dodano limity czasu dla kolejnych etapów zapisu protokołu oraz limit całkowity 45 sekund, aby oczekiwanie na Supabase nie mogło bezterminowo blokować aplikacji mobilnej.
- Po sukcesie, błędzie i przekroczeniu czasu ekran protokołu jest zawsze ponownie odblokowywany, a użytkownik otrzymuje czytelny komunikat pozwalający ponowić zapis.
- Usunięto dodatkowe pobieranie protokołu po udanym zapisie; potwierdzony rekord wraca teraz bezpośrednio z operacji `insert` lub `update`.
- Przekroczenie czasu zapisuje w cichej diagnostyce zdarzenie `protocol.save.timeout` z etapem operacji i limitem czasu, bez danych klienta.
- Dodano test symulujący nigdy niekończący się upload oraz kontrolę braku dodatkowego odczytu po zapisie.
- Service worker używa cache `wawis-app-shell-v10.11`.

## 10.10
- Dodano trwały kursor zmian, zapisywany po każdym poprawnie obsłużonym wpisie synchronizacji.
- Pięciominutowe zabezpieczenie Realtime pobiera tylko zmienione zlecenia; pełny refresh pozostaje bezpiecznym fallbackiem dla instalacji bez nowej migracji.
- Kolejka operacji offline odzyskuje wygasłe blokady, stosuje backoff i potwierdza wykonanie stabilnym identyfikatorem po stronie serwera.
- Kolejka zdjęć przechowuje przygotowany plik i etap uploadu, dzięki czemu po przerwaniu nie kompresuje zdjęcia ponownie i uzgadnia stałą ścieżkę bez duplikatów.
- Dodano centralną, cichą diagnostykę bez danych klientów oraz jej podgląd w desktopowym module administratora.
- Dodano trwałą kolejkę kopii i funkcję kopiującą zdjęcia oraz protokoły do prywatnych bucketów w drugim projekcie Supabase.
- Dodano jawne GRANT, RLS i administracyjne ograniczenia odczytu dla nowych tabel.
- Service worker używa cache `wawis-app-shell-v10.10`.

## 10.09
- Powiększono tekst informacji o przetwarzaniu danych osobowych i zagospodarowaniu odpadów z 9 pt do 9,4 pt.
- Powiększono podpis klienta w protokole przy zachowaniu jego naturalnych proporcji oraz miejsca na pieczątkę instalatora.
- Zwiększono grubość kreski podpisu na ekranie telefonu z 2,2 px do 2,8 px, aby podpis był czytelniejszy na wydruku termicznym.
- Przesunięto początek głównej treści o 4 pt w górę, wykorzystując lepiej wysokość strony A4.
- Kontrolny protokół z dwiema jednostkami i potwierdzeniem płatności pozostaje na jednej stronie A4.
- Service worker używa cache `wawis-app-shell-v10.09`.

## 10.08
- Usunięto oznaczenie `WERSJA TESTOWA` z prawego górnego rogu protokołu PDF.
- Po prawej stronie pola podpisu klienta dodano osobną linię i opis `Pieczątka i podpis instalatora`.
- Wyśrodkowano nagłówek informacji o przetwarzaniu danych osobowych.
- Wyśrodkowano nagłówek zagospodarowania odpadów.
- Zachowano pełniejsze wykorzystanie A4, większą czcionkę, jedną stronę dokumentu i czarny kolor druku.
- Service worker używa cache `wawis-app-shell-v10.08`.

## 10.07
- Zmniejszono marginesy sekcji protokołu PDF do 12 pt, czyli około 4,2 mm.
- Powiększono wszystkie teksty protokołu, a nie tylko sekcję informacji i ustaleń.
- Tekst RODO i zagospodarowania odpadów zwiększono do 9 pt z interlinią 10,3 pt.
- Powiększono nagłówek firmy, dane klienta, realizację, urządzenia, płatność, potwierdzenie klienta i stopkę.
- Powiększono pole podpisu klienta przy zachowaniu proporcji oraz pustej prawej części na podpis pracownika i pieczątkę.
- Wykorzystano wolną wysokość strony, zachowując typowy protokół na jednej stronie A4.
- Service worker używa cache `wawis-app-shell-v10.07`.

## 10.06
- Zmniejszono zewnętrzne marginesy kart protokołu PDF z 32 pt do 16 pt, czyli do około 5,6 mm.
- Poszerzono wszystkie sekcje i obszary tekstu, zachowując bezpieczny obszar wydruku A4.
- Zwiększono czcionkę informacji o przetwarzaniu danych i zagospodarowaniu odpadów z 6,55 pt do 8 pt oraz podniesiono jej interlinię.
- Powiększono czcionki danych klienta, realizacji, urządzeń, płatności, nagłówków i stopki.
- Zagęszczono wyłącznie pionowe odstępy, aby typowy protokół nadal mieścił się na jednej stronie A4.
- Zachowano czarną czcionkę, proporcjonalny podpis klienta po lewej i wolną prawą połowę na podpis pracownika oraz pieczątkę.
- Service worker używa cache `wawis-app-shell-v10.06`.

## 10.05
- Dodano automatyczne przycinanie białych marginesów z obrazu podpisu klienta.
- Podpis jest skalowany w PDF z zachowaniem naturalnych proporcji zamiast wymuszania rozmiaru 240 × 32 punkty.
- Zwiększono wysokość pola podpisu i wyśrodkowano podpis nad jego linią.
- Przy ponownym otwarciu podpisu jego podgląd również zachowuje proporcje.
- Zachowano czarną czcionkę protokołu oraz pustą prawą stronę na podpis pracownika i pieczątkę.
- Dodano test obliczeń proporcjonalnego skalowania podpisu.
- Service worker używa cache `wawis-app-shell-v10.05`.

## 10.04
- Ustawiono wszystkie teksty protokołu PDF na czarny kolor pod wydruk termiczny Phomemo M832.
- Wzmocniono etykiety danych zlecenia i realizacji, nagłówki tabel, dane płatności, status tabliczki, teksty prawne, potwierdzenie klienta i stopkę.
- Zachowano układ podpisu klienta po lewej stronie oraz puste miejsce na podpis pracownika i pieczątkę.
- Dodano automatyczny test zabraniający jasnych i kolorowych tekstów w generatorze protokołu.
- Service worker używa cache `wawis-app-shell-v10.04`.

## 10.03
- Przeniesiono podpis klienta na lewą połowę sekcji potwierdzenia, bezpośrednio nad jego opisem.
- Skrócono linię podpisu do lewej części dokumentu.
- Prawą połowę pozostawiono pustą na ręczny podpis pracownika i pieczątkę.
- Usunięto powtórzoną datę spod podpisu; data podpisania pozostaje w nagłówku protokołu.
- Dodano test źródłowy pilnujący tego układu i zaktualizowano kontrolny render PDF.
- Service worker używa cache `wawis-app-shell-v10.03`.

## 10.02
- Zapisany protokół PDF jest podczas drukowania renderowany w pamięci telefonu do obrazu PNG.
- Phomemo otrzymuje wyłącznie obraz, ponieważ test na M832 potwierdził obsługę obrazów z menu udostępniania iPhone'a.
- Wszystkie strony PDF są łączone pionowo w jeden obraz przeznaczony do wydruku na rolce.
- Plik wydruku nie jest zapisywany w `Zdjęciach`, `Plikach` ani `Pobranych`.
- Dodano ładowany dopiero podczas drukowania renderer PDF.js w wersji 5.4.394.
- Service worker używa cache `wawis-app-shell-v10.02`.

## 10.01
- Przycisk mobilny ma nazwę `Drukuj protokół` i przekazuje do systemowego menu iPhone'a wyłącznie plik PDF.
- Usunięto tytuł i tekst z pakietu udostępniania, aby Phomemo nie wybierało funkcji nieobsługiwanej przez M832.
- Usunięto awaryjne pobieranie PDF-u z akcji drukowania; dokument nie zapisuje się pracownikowi w telefonie.
- Brak obsługi bezpośredniego przekazania PDF jest zgłaszany czytelnym komunikatem.
- Service worker używa cache `wawis-app-shell-v10.01`.

## 10.00
- Usunięto z nagłówka desktopowego Centrum 360 powielone małe pole `Szukaj… Ctrl K`.
- Usunięto sąsiedni, niepotrzebny przycisk `Dzisiaj`.
- Zachowano główne globalne wyszukiwanie klienta, telefonu, adresu, modelu i numeru seryjnego.
- Naprawiono przejście z wyniku typu `Kontrahent`: moduł otwiera listę zamiast pustego widoku.
- Wyszukany klient jest automatycznie zaznaczany i od razu pokazuje się jego panel szczegółów.
- Nie zmieniono mobilnej paginacji, zwijanych kart urządzeń ani kontroli tabliczek.
- Service worker używa cache `wawis-app-shell-v10.00`.

## 9.99
- Usunięto prefiks `Przez:` z nazwiska osoby kończącej zlecenie w widoku mobilnym.
- Wymuszono wyświetlanie imienia i nazwiska wykonawcy w jednej linii.
- Zwężono mobilne przyciski paginacji do 28 × 30 px, a wielokropek do 9 px.
- Cały układ `‹ 1 2 3 … ostatnia ›` pozostaje w jednym rzędzie również przy stronach środkowych, gdzie występują dwa wielokropki.
- Krytyczne style paginacji są dołączone do jej komponentu, aby zmiana nie była blokowana przez stary cache arkusza CSS na iPhonie.
- Zwijane karty urządzeń oraz kontrola kompletu tabliczek z wersji 9.98 pozostają bez zmian.
- Service worker używa cache `wawis-app-shell-v9.99`.

## 9.98
- Poszerzono lewą kolumnę mobilnego wiersza `ZAKOŃCZONO` i dodano wymuszony odstęp od daty.
- Data zakończenia oraz wiersz `Przez: [pracownik]` są wyśrodkowane w prawej części.
- Karty `Urządzenie 1`, `Urządzenie 2` itd. są domyślnie zwinięte po otwarciu zlecenia.
- Każde urządzenie można rozwinąć niezależnie przez dotknięcie jego nagłówka; przycisk `Usuń` pozostaje osobną akcją administratora.
- Zwijanie nie zmienia sprawdzania kompletu tabliczek ani blokady zakończenia zlecenia.
- Service worker używa cache `wawis-app-shell-v9.98`.

## 9.97
- Nazwa firmy i `Piotr Wasik` są wyświetlane w jednym wierszu nagłówka protokołu.
- Adres połączono z NIP-em, a telefon, e-mail i stronę WWW umieszczono w jednym wierszu.
- Usunięto REGON z protokołu powykonawczego.
- Zmniejszono i wyrównano pionowe odstępy w kartach danych zlecenia, realizacji i płatności.
- Zwiększono czcionkę informacji o przetwarzaniu danych osobowych i ustalenia dotyczącego odpadów, zachowując typowy protokół na jednej stronie A4.
- Service worker używa cache `wawis-app-shell-v9.97`.

## 9.96
- Dodano kartę `Protokół klienta` w desktopowych szczegółach zakończonego zlecenia administratora.
- Desktop pobiera istniejący wpis z `job_protocols` i pokazuje datę podpisania zapisanego PDF.
- Dodano pełnoekranowy podgląd PDF osadzony w aplikacji.
- Dodano standardowy wydruk z przeglądarki oraz firmową wysyłkę do klienta z `biuro@wawis.pl`.
- Wysyłka korzysta z istniejącej Edge Function `send-job-protocol-email`, więc pracownik ani administrator nie używa prywatnej skrzynki.
- Brak prawidłowego e-maila klienta bezpiecznie wyłącza przycisk wysyłki.
- Nie zmieniono schematu bazy ani mobilnego tworzenia, płatności i podpisu protokołu.
- Service worker używa cache `wawis-app-shell-v9.96`.

## 9.95
- Zwężono mobilne kafelki paginacji do 30 × 32 px i zmniejszono odstępy między nimi do 3 px.
- Dodano osobne klasy aktywnego widoku mobilnego, aby reguły nie były nadpisywane przez starszy układ paginacji.
- Wymuszono jeden rząd strzałek, numerów stron i wielokropka bez zawijania.
- Dodano 14 px odstępu między etykietą `Zakończono` a kolumną danych.
- Data zakończenia oraz wykonawca są wyśrodkowane w prawej kolumnie.
- Test produkcyjnego builda sprawdza obecność aktywnych klas i końcowych reguł CSS 9.95.
- Service worker używa cache `wawis-app-shell-v9.95`.

## 9.94
- Zmniejszono mobilne przyciski paginacji i zablokowano ich zawijanie do drugiego rzędu.
- Mobilna paginacja pokazuje najwyżej trzy sąsiednie numery stron, zachowując skróty do pierwszej i ostatniej strony.
- Data montażu oraz data zakończenia są wyrównane do prawej strony w szczegółach zlecenia.
- Wykonawca zakończenia jest pokazywany w osobnej linii, bez nachodzenia daty na etykietę `Zakończono`.
- Service worker używa cache `wawis-app-shell-v9.94`.

## 9.93
- Naprawiono natywne pole `Data zapłaty` na iPhonie: jego ramka nie wychodzi już poza prawą krawędź karty potwierdzenia zapłaty.
- Formularz płatności i wszystkie jego pola mają jawne ograniczenie szerokości oraz `box-sizing: border-box`, dlatego padding pola daty mieści się wewnątrz dostępnego miejsca.
- Zachowano czcionkę 16 px zapobiegającą automatycznemu przybliżaniu formularza przez Safari.
- PDF, podpis klienta, zapis płatności, druk i wysyłka pozostają bez zmian.
- Service worker używa cache `wawis-app-shell-v9.93`.

## 9.92
- Usunięto z PDF sekcję `Dokumentacja zapisana w aplikacji`, która powtarzała dane dostępne już w zleceniu.
- Zwężono pionowy układ danych zlecenia, płatności i podpisu, zachowując czytelność wydruku A4 dla Phomemo M832.
- Dodano poprawioną, skróconą informację o przetwarzaniu danych osobowych opartą na art. 6 i 13 RODO; dokument nie przedstawia realizacji umowy jako zgody klienta i nie zawiera nieaktualnej zapowiedzi powołania inspektora.
- Dodano ustalenie dotyczące zagospodarowania odpadów na podstawie art. 3 ust. 1 pkt 32 ustawy o odpadach.
- Podpis klienta potwierdza zakończenie montażu, ewentualną płatność i akceptację ustalenia dotyczącego odpadów.
- Usunięto z PDF zdanie o niezastępowaniu faktury lub paragonu.
- Service worker używa cache `wawis-app-shell-v9.92`.

## 9.91
- Pola kwoty, rodzaju płatności, sposobu płatności i daty w mobilnym protokole używają czcionki 16 px.
- iPhone nie powinien już automatycznie przybliżać całego formularza po dotknięciu pola kwoty ani pozostawiać widoku w powiększonej skali po wpisaniu wartości.
- Nie zablokowano ręcznego powiększania aplikacji; poprawka dotyczy wyłącznie automatycznego zoomu pól formularza w Safari/WebKit.
- Układ, zapis płatności, podpis, PDF, druk i wysyłka pozostają bez zmian.
- Service worker używa cache `wawis-app-shell-v9.91`.

## 9.90
- Usunięto z mobilnego formularza protokołu informację `Nie zastępuje faktury, paragonu ani innego dokumentu księgowego`.
- Nagłówek `Potwierdzenie klienta` pozostał, ale usunięto opis potwierdzania zakończenia montażu i danych płatności.
- Przed złożeniem podpisu nie są już pokazywane teksty `Brak podpisu klienta` ani opis osobnego, nieruchomego ekranu; pozostaje sam przycisk `Podpis klienta`.
- Po złożeniu podpisu nadal jest widoczny jego status, a działanie podpisu, zapisu PDF, płatności, druku i wysyłki nie zostało zmienione.
- Service worker używa cache `wawis-app-shell-v9.90`.

## 9.89
- Zapisany protokół bez płatności nie pokazuje już pustej sekcji zawierającej wyłącznie nagłówek `Potwierdzenie zapłaty`.
- Sekcja płatności pojawia się podczas uzupełniania protokołu albo wtedy, gdy płatność została rzeczywiście zapisana i ma podsumowanie.
- Przycisk `Zmień protokół` otrzymał czytelniejszą nazwę `Uzupełnij protokół`, ponieważ prowadzi do danych płatności i podpisu klienta.
- Zapis PDF, płatność, podpis, druk Phomemo i firmowa wysyłka pozostają bez zmian.
- Service worker używa cache `wawis-app-shell-v9.89`.

## 9.88
- Uproszczono dolną część mobilnego formularza protokołu bez zmian w samym PDF i sposobie zapisu płatności.
- Usunięto opis „Opcjonalnie dodawane do tego samego protokołu PDF” spod nagłówka potwierdzenia zapłaty.
- Usunięto komunikat „Potwierdzenie zapłaty nie zostanie dodane do protokołu”, gdy opcja płatności jest wyłączona.
- Usunięto stałe i chwilowe komunikaty o konieczności ponownego podpisu po zmianie danych; pozostawiono status podpisu oraz przycisk otwierający osobny ekran podpisu.
- Zachowano przełącznik `Dodaj`, pola kwoty, rodzaju, metody i daty, ponowne podpisanie zmienionego dokumentu oraz wszystkie funkcje wersji 9.87.
- Service worker używa cache `wawis-app-shell-v9.88`.

## 9.87
- Mobile pracownika i administratora: akcja e-mail nie otwiera już Outlooka, Mail ani prywatnej skrzynki telefonu.
- Przycisk `Wyślij z biuro@wawis.pl` wywołuje nową zabezpieczoną Edge Function `send-job-protocol-email`, która pobiera prywatny PDF i wysyła go jako załącznik z firmowego adresu.
- Serwer ponownie sprawdza sesję, dostęp użytkownika do zlecenia, status `Zakończone`, powiązanie protokołu ze zleceniem i zgodność odbiorcy z adresem klienta zapisanym w zleceniu.
- Dodano idempotentny skrypt `supabase/setup-job-protocol-email-v9.87.sql` oraz tabelę `job_protocol_email_log` z RLS, rejestrem nadawcy, odbiorcy, pracownika, statusu i identyfikatora dostawcy.
- Wysyłka używa Resend z kluczem przechowywanym wyłącznie w sekretach Supabase; domena `wawis.pl` musi być zweryfikowana przed uruchomieniem produkcyjnym.
- Dodano klucz idempotencji dostawcy, blokadę ponownej wysyłki przez 30 sekund, limit PDF 10 MB i bezpieczne kodowanie danych klienta w treści wiadomości.
- Menu systemowe telefonu pozostało wyłącznie przy druku w Phomemo; zapis PDF nadal działa bez zmian.
- Dodano test jednostkowy, test zabezpieczeń funkcji, test SQL oraz mobilny scenariusz E2E pracownika wysyłającego protokół z biuro@wawis.pl.
- Service worker używa cache `wawis-app-shell-v9.87`.

## 9.86
- Mobile pracownika i administratora: na zakończonym zleceniu pozostaje jeden przycisk `Protokół`; pobieranie, e-mail i druk są dostępne dopiero wewnątrz protokołu.
- Dodano opcjonalne potwierdzenie zapłaty z kwotą, rodzajem wpłaty, metodą i datą. Dane są zapisywane w zleceniu przez idempotentny skrypt `supabase/setup-job-payment-confirmation-v9.86.sql`.
- Zmiana danych po zapisaniu dokumentu unieważnia poprzedni podpis i wymaga ponownego podpisania przez klienta przed zastąpieniem PDF.
- Przycisk `Drukuj lub wyślij` rozwija akcje `Drukuj w Phomemo`, `Wyślij e-mailem` i `Zapisz PDF w telefonie`, bez dokładania przycisków do karty zlecenia.
- Druk w Phomemo przekazuje PDF do systemowego menu udostępniania telefonu, z którego można wybrać aplikację Phomemo i drukarkę M832.
- PDF otrzymał jasny, oszczędny układ do druku termicznego, okrągły znak `W`, pełne dane firmy oraz opcjonalną sekcję potwierdzenia zapłaty.
- Dodano test zapisu płatności, wymiany istniejącego protokołu, układu mobilnego oraz jednostronicowy wzorzec PDF z płatnością.
- Service worker używa cache `wawis-app-shell-v9.86`.

## 9.85
- PDF protokołu używa oryginalnego logo WAWIS znajdującego się w aplikacji.
- W nagłówku dodano pełne dane firmy: WAWIS Chłodnictwo i Klimatyzacja, Piotr Wasik, ul. Rolnicza 40, 42-400 Zawiercie, tel. 606 553 984, biuro@wawis.pl, NIP 6492040094 i REGON 240887046.
- Usunięto z nagłówka tekst „Potwierdzenie zakończenia montażu”; w jego miejscu znajdują się teraz dane kontaktowe i rejestrowe firmy.
- Zachowano jedną stronę A4, dane zlecenia, urządzenia, dokumentację, podpis klienta oraz oznaczenie wersji testowej.
- Generator ma awaryjny znak WAWIS na wypadek chwilowej niedostępności pliku logo.
- Service worker używa cache `wawis-app-shell-v9.85`.

## 9.84
- Mobile: uporządkowano ekran protokołu — dane zlecenia mają stały układ etykieta–wartość, a urządzenia są pokazane jako osobne karty bez zlewających się kolumn.
- Zmniejszono i ujednolicono typografię, odstępy, komunikat wersji testowej oraz podsumowanie zdjęć na wąskich ekranach iPhone'a.
- Podpis klienta przeniesiono z przewijanej treści protokołu do osobnego, pełnoekranowego okna bez przewijania i bez przesuwania podczas rysowania.
- Podpis wymaga osobnego zatwierdzenia; po powrocie protokół pokazuje jego status i pozwala go zmienić przed zapisaniem PDF.
- Testy wydania sprawdzają pełną wysokość nieruchomego ekranu, blokadę przewijania, zatwierdzenie podpisu oraz wynikowy CSS i JavaScript.
- Service worker używa cache `wawis-app-shell-v9.84`.

## 9.83
- Mobile: ekran protokołu przebudowano na sprawdzonej pełnoekranowej obudowie kreatora „Dodaj urządzenie”.
- AppModal protokołu zawiera teraz jeden główny element `.mobileDeviceWizard`, zamiast wielu bezpośrednich sekcji podatnych na ogólne reguły `.modal`.
- Nagłówek, przewijany środek i przyciski na dole działają według tego samego układu co kreator urządzeń.
- Zachowano podpis, generowanie PDF, zapis, pobranie i wysyłkę e-mail; testy sprawdzają również wynikowy CSS i JavaScript.
- Service worker używa cache `wawis-app-shell-v9.83`.

## 9.82
- Mobile: protokół został całkowicie odłączony od ogólnej klasy `.modal` używanej przez podgląd zdjęć; stare reguły nie mogą już ustawić jego zawartości w jednym rzędzie ani nadać jej ciemnego tła.
- Dodano osobną klasę układu protokołu i widoczny numer uruchomionej wersji w jego nagłówku.
- Po aktywacji nowego Service Workera aplikacja automatycznie przeładowuje stronę, ograniczając pozostawanie telefonu na starej paczce po aktualizacji.
- Test wizualny wersji mobilnej otwiera protokół i sprawdza rzeczywisty układ okna, a kontrola `dist` sprawdza wynikowy CSS i JavaScript.
- Service worker używa cache `wawis-app-shell-v9.82`.

## 9.81
- Mobile: naprawiono ekran protokołu, którego zawartość na iPhonie była nadpisywana przez stare globalne style klasy `.modal` i układała się jedna na drugiej.
- Protokół otrzymał końcowy, odseparowany układ: białe tło, pionowy przepływ treści, kontrolowane przewijanie i prawidłowe marginesy bezpiecznego obszaru iPhone'a.
- Safari nie może już automatycznie powiększać tekstu wewnątrz protokołu, a pole podpisu zachowuje pełną szerokość oraz wysokość 170 px.
- Podgląd zdjęć i pozostałe okna aplikacji zachowują dotychczasowe działanie.
- Dodano test wydania pilnujący kolejności i odporności stylów protokołu.
- Service worker używa cache `wawis-app-shell-v9.81`.

## 9.80
- Mobile pracownika i administratora: nowy formularz klienta/montażu automatycznie wstawia bieżącą lokalną datę urządzenia do pola `Data montażu`.
- Data jest obliczana przy każdym otwarciu nowego formularza, a użytkownik nadal może ją ręcznie zmienić albo wyczyścić.
- Edycja istniejącego montażu zachowuje jego zapisaną datę i nie zastępuje jej bieżącym dniem.
- Dodano test wydania obejmujący lokalną datę, świeży formularz oraz brak zmiany wzorca i istniejących danych.
- Service worker używa cache `wawis-app-shell-v9.80`.

## 9.79
- Mobile pracownika i administratora: przycisk `Utwórz protokół` jest dostępny wyłącznie na zleceniu, które ma już status `Zakończone`; protokół nie uczestniczy w zakończeniu i nie może go zablokować.
- Po podpisie klienta PDF jest zapisywany w prywatnym bucketcie `job-protocols` i wiązany ze zleceniem w tabeli `job_protocols`.
- Na zakończonej karcie z zapisanym dokumentem pojawiają się akcje `Pobierz protokół` i `Wyślij e-mailem`; iPhone przekazuje PDF do systemowego menu udostępniania, a przeglądarka bez obsługi udostępniania otwiera e-mail z siedmiodniowym linkiem.
- Dodano idempotentny skrypt `supabase/setup-job-protocols-v9.79.sql`, prywatny dostęp RLS wyłącznie dla administratora i użytkowników mających dostęp do danego zlecenia oraz blokadę tworzenia protokołu dla niezakończonego zlecenia.
- Protokół pozostaje opcjonalny i testowy; pracownik nie musi go tworzyć, a numery seryjne nadal nie trafiają do PDF.
- Test wydania sprawdza kolejność zakończenie → protokół, zapis i późniejsze pobranie, obsługę e-maila, RLS, brak numerów seryjnych oraz rzeczywiste renderowanie jednostronicowego PDF.
- Service worker używa cache `wawis-app-shell-v9.79`.

## 9.78
- Mobile pracownika i administratora: w szczegółach każdego zlecenia dodano opcjonalny przycisk `Protokół TEST`.
- Protokół pokazuje wyłącznie dane dostępne w karcie zlecenia: klienta, kontakt, adres, termin, status, monterów, modele JW/JZ, stan zdjęć tabliczek i liczbę pozostałych zdjęć.
- Klient może podpisać się palcem w pełnoekranowym oknie na telefonie, wyczyścić podpis i utworzyć PDF; na iPhonie aplikacja korzysta z systemowego udostępniania pliku, a w pozostałych przeglądarkach pobiera PDF.
- Funkcja jest testowa i nieobowiązkowa: nie blokuje zakończenia zlecenia, nie zmienia jego statusu i nie zapisuje protokołu ani podpisu w Supabase.
- Numery seryjne nie są pokazywane w protokole, ponieważ administrator uzupełnia je później na podstawie zdjęć tabliczek.
- Dodano osadzone czcionki z polskimi znakami oraz test wydania pilnujący uprawnień, opcjonalności i braku zapisu do backendu.
- Service worker używa cache `wawis-app-shell-v9.78`.

## 9.77
- Wersja wyłącznie techniczna, bez zmian graficznych i bez nowej migracji SQL.
- Desktop i mobile: zapis statusu, notatki, komentarza, przypisania pracownika, danych urządzenia i zdjęć odświeża tylko zmieniony montaż lub jego szczegóły; pełne przeładowanie listy pozostaje przy dodaniu/usunięciu montażu oraz jako pięciominutowy fallback.
- PUSH: zdarzenia `focus`, `pageshow` i `visibilitychange` korzystają z jednej kontroli w oknie 10 minut; start aplikacji i powrót internetu nadal wymuszają natychmiastową kontrolę.
- PUSH: zwykła kontrola subskrypcji wykonuje jeden odczyt rekordu zamiast sekwencji odczyt–zapis–odczyt, a `last_seen_at` jest podtrzymywane najwyżej raz na 6 godzin; samonaprawa brakującego lub wygasłego endpointu pozostaje aktywna.
- Centrum 360: centralne liczniki, dane kolejki SMS i urządzeń mają współdzielony cache 5 minut oraz deduplikację równoległych zapytań.
- Mobile offline: synchronizacja korzysta z aktualnego kontekstu bez przebudowy callbacku po każdej zmianie listy; timer 45 s działa tylko wtedy, gdy faktycznie czekają zdjęcia lub operacje.
- Service worker używa cache `wawis-app-shell-v9.77`.

## 9.76
- Mobile pracownika: przy tworzeniu nowego klienta/montażu można wybrać `Nowe`, `W trakcie` albo `Zakończ od razu`.
- `Zakończ od razu` wymaga kompletu tabliczek; serwer zapisuje zlecenie jako `W trakcie`, a zakończenie jest wykonywane automatycznie dopiero po potwierdzeniu wszystkich tabliczek w Supabase, z zachowaniem PUSH do administratora.
- Pracownik może teraz rozpocząć także zlecenie ze statusu `Nowe` (`Nowe` → `W trakcie`), a `Niezrealizowane` → `W trakcie` nadal działa jako `Rozpocznij ponownie`.
- Test nowego wyboru statusu pracownika jest częścią pełnego i mobilnego procesu wydania.
- Brak zmian w wyglądzie desktopu i brak nowej migracji SQL.

## 9.75
- Desktop i mobile: odświeżanie listy montaży jest odseparowane od pobierania profili, powiadomień i szczegółów; świeża lista może pojawić się mimo chwilowego 500/504 w pobocznych danych.
- Desktop: Realtime dla `jobs` odświeża pojedynczy montaż, a zdjęcia i komentarze odświeżają wyłącznie szczegóły otwartej karty; pełny fallback działa co 5 minut i nie uruchamia się ponownie przy samym `SUBSCRIBED`.
- Desktop i mobile: pobieranie zdjęć/komentarzy jednego montażu ma limit 7 s; po przekroczeniu limitu spinner kończy się i pojawia się ręczne `Ponów` zamiast automatycznej pętli retry.
- Desktop i mobile: metadane zdjęć i komentarze są renderowane przed generowaniem signed URL miniatur; miniatury 400 px są podpisywane w tle, a pełny obraz nadal dopiero po kliknięciu.
- Desktop i mobile: nieudane odświeżenie szczegółów w tle nie ukrywa wcześniej poprawnie załadowanych zdjęć i komentarzy.
- Mobile: dodano taki sam limit szczegółów, błąd lokalny z `Ponów`, deferred thumbnails i lazy loading miniatur jak na desktopie, bez zmian w kolejce/offline uploadu.
- Auth desktop i mobile: chwilowy 500/504 nie jest dowodem wylogowania; retry przywracania sesji jest ograniczony do 30 s, a wylogowanie lokalne nie czeka bez końca na wolny endpoint Auth.
- Service worker: cache aplikacji podbity do `wawis-app-shell-v9.75`.
- Brak nowej migracji SQL i brak zmian w RLS/Storage; v9.75 zmienia logikę klienta i odświeżania.

## 9.74
- Mobile: lista montaży pobiera się jako pierwsza i niezależnie od profili, powiadomień oraz pozostałych danych.
- Mobile: po poprawnym pobraniu listy chwilowy 500/504 w Auth/profilach nie usuwa ani nie zasłania świeżych montaży.
- Mobile: niespodziewane SIGNED_OUT jest weryfikowane przed wylogowaniem; timeout Auth nie czyści lokalnej sesji.
- Mobile: ręczne Odśwież najpierw pobiera montaże, a synchronizację zdjęć/kolejki uruchamia później w tle.
- Service worker: nowy cache aplikacji dla 9.74.

## 9.73
- Bezpieczne usuwanie błędnego urządzenia: tabliczki pozostałych urządzeń nie są już przenoszone ani zmieniane w Storage.
- Zdjęcia tabliczek mają jawne przypisanie photo_kind / device_index / unit_ref w tabeli photos; wszystkie dotychczasowe tabliczki zostały zbackfillowane.
- Po usunięciu urządzenia kolejne urządzenia są logicznie przenumerowane przez metadane, a ich fizyczne pliki pozostają bez zmian.
- Plik usuwanego urządzenia jest kasowany tylko wtedy, gdy żaden pozostały rekord już go nie używa.
- Dodano zgodność ochronną z v9.72 na czas przejścia.

## 9.72
- Administrator: bezpośrednie usuwanie błędnie dodanego urządzenia z sekcji „Urządzenia i tabliczki” na mobile i desktopie.
- Usunięcie czyści tabliczki JZ/JW oraz ręczne potwierdzenia wybranego urządzenia.
- Przy usunięciu urządzenia ze środka listy pozostałe urządzenia i ich tabliczki są automatycznie przenumerowywane.
- Backend: dodano admin-only RPC admin_delete_job_device; aktualizacja jobs automatycznie synchronizuje tabelę devices.

## 2026-08-26 — 9.71
- Mobile: zdarzenia Realtime dla jobs/job_access odświeżają tylko zmienione zlecenie zamiast całego refreshAll.
- Mobile: zdjęcia i komentarze nadal odświeżają wyłącznie szczegóły otwartego zlecenia.
- Mobile: usunięto duplikujące pełne odświeżenie przy SUBSCRIBED oraz ograniczono globalny fallback do 5 minut.
- Mobile: po focus/visibility pełny refresh jest wykonywany tylko po dłuższej przerwie; otwarte zlecenie odświeża się niezależnie.
- Mobile: wszystkie równoległe pełne refreshAppData współdzielą jedno zapytanie in-flight.
- Mobile: automatyczne przywracanie sesji korzysta z cichego refreshu, a retry po błędzie przejściowym nie uderza w serwer co 5 s tylko co 30 s.
- Mobile: usunięto czterokrotny post-upload retry szczegółów 1,2/5/12/20 s; został jeden debounced fallback dla konkretnego zlecenia.
- Kolejka/offline, kompresja i mechanizm PUSH pozostają bez zmian.

## 9.70
- PUSH jest obowiązkowy: usunięto możliwość wyłączania na desktopie i mobile; mobilny wskaźnik jest stały, zielony i pokazuje ON.
- Przy każdym wejściu, powrocie do aplikacji, odzyskaniu internetu i cyklicznym healthchecku aplikacja sprawdza oraz naprawia subskrypcję PUSH.
- Jeśli zgoda systemowa jest już przyznana, brakująca subskrypcja jest odtwarzana automatycznie bez pytania użytkownika.
- Jeśli serwer oznaczy endpoint jako wygasły po 404/410, aplikacja usuwa starą subskrypcję, tworzy nowy endpoint i ponownie zapisuje go w Supabase.
- Dla nowego urządzenia z permission=default aplikacja prosi o jednorazową zgodę przy pierwszym geście użytkownika (wymóg iOS/Web Push).
- Starsze wywołanie funkcji wyłączającej nie dezaktywuje PUSH; dla zgodności próbuje utrzymać aktywną subskrypcję.

## 2026-08-25 — 9.69
- Mobile: pobieranie zdjęć z serwera działa tak jak na desktopie — miniatury 400 px w szczegółach, pełny obraz dopiero po kliknięciu.
- Mobile: signed URL-e zdjęć mają cache w sessionStorage i deduplikację równoległych zapytań.
- Mobile: reload szczegółów montażu deduplikuje równoległe żądania, a realtime nie używa już pollingu co 10 s ani łańcucha 4 retry.
- Kolejka/offline po stronie mobile pozostała bez zmian.

# Wawis v9.68

- Desktop: usunięto serię ponowień szczegółów po 1,2 / 5 / 12 / 20 s; Realtime wykonuje jedno zdebounce’owane odświeżenie otwartego zlecenia.
- Desktop: zdjęcia i komentarze otwartego zlecenia odświeżają się niezależnie od globalnego `refreshAll()`.
- Desktop: przy otwieraniu zlecenia generowany jest wyłącznie signed URL miniatury 400 px; pełny signed URL powstaje dopiero po kliknięciu zdjęcia lub uruchomieniu odczytu tabliczki.
- Desktop: dodano blokadę równoległych zapytań o ten sam signed URL oraz blokadę równoległych `reloadJobDetails(jobId)`.
- Desktop: cache signed URL działa również w `sessionStorage` i zachowuje linki po zwykłym odświeżeniu strony przez bezpieczne okno około 55 minut.
- Mobile: logika zdjęć i Realtime pozostaje bez zmian; zmieniono wyłącznie numer wersji.

# Wawis v9.62

- Baza: v9.59 + poprawka stabilnego stanu PUSH po odświeżeniu.
- Desktop: przycisk „Odczytaj kody” zachowuje EAN/Code128 jako źródła potwierdzone.
- Jeśli kod kreskowy numeru seryjnego nie zostanie rozpoznany, uruchamia się wąski lokalny odczyt tylko pola z oznaczeniem `SN:`.
- Numer odczytany z nadruku jest automatycznie wpisywany jako „Do sprawdzenia”, a nie jako potwierdzony kod kreskowy.
- Mobile i układ desktopu pozostają bez zmian względem bazy 9.59.

## 9.59
- Mobile: ujednolicone wysokości małych kontrolek i badge’y.
- Mobile: lżejsze cienie i delikatniejsze obramowania kart/paneli.
- Mobile: wyrównany spacing między nagłówkiem, ikonami statusów, pierwszą kartą i kolejnymi kartami.
- Bez zmian logiki i układu aplikacji.


## 9.53 — mobilny widok Montaży: lżejszy i bardziej kompaktowy
- Zmniejszono etykietę wersji do dyskretnego `v9.53` w górnym rzędzie panelu.
- Zachowano układ akcji `+ / odśwież / D` dla administratora oraz brak diagnostyki u pracownika.
- PUSH pozostaje w dolnym rzędzie obok użytkownika, ale zajmuje mniej miejsca.
- Zmniejszono pastylki statusu na kartach i odstępy wewnątrz kart.
- Uproszczono ramki i cienie oraz zmniejszono puste przestrzenie między nagłówkiem, ikonami statusów i listą.
- Pozycja zaakceptowanych badży liczników na ikonach statusów pozostaje bez zmian.
## 9.42
- mobile: przebudowano wyłącznie górny panel Montaży na izolowany, dwurzędowy układ liczony pod szerokość telefonu,
- admin: pierwszy rząd mieści wersję, `+`, synchronizację, `D` i mini-przełącznik PUSH; drugi rząd zawiera mały filtr i użytkownika,
- pracownik: ten sam kompaktowy układ bez diagnostyki `D` i bez osobnego przycisku wylogowania; dodatkowe moduły administracyjne nadal nie są pokazywane,
- tytuł aktywnego statusu jest mniejszy i wyśrodkowany, a oryginalne cztery kolorowe grafiki statusów pozostały bez zmian,
- mobilna karta listy nie dodaje dodatkowych bocznych wcięć, dzięki czemu panel wykorzystuje pełną dostępną szerokość i nie powinien zawijać PUSH/filtra,
- brak zmian desktopu, bazy, Supabase, RLS, zdjęć, synchronizacji i logiki zleceń.

## 9.39
- desktop i mobile: po rozpoznaniu sesji aplikacja pokazuje ostatnią lokalną kopię profilu i listy montaży, zanim zakończy się pełny odczyt z Supabase,
- aktualne dane są zawsze pobierane normalnie z Supabase i automatycznie zastępują lokalny snapshot,
- dyskretny status `Odświeżanie` informuje o trwającej synchronizacji bez blokowania ekranu,
- kolejne identyfikatory odświeżeń chronią stan React przed spóźnioną, starszą odpowiedzią serwera,
- zapis snapshotu porównuje `server_fetched_at_ms`, dlatego starsza lokalna kopia nie może zastąpić nowszej,
- desktopowy snapshot pomija zdjęcia i komentarze szczegółowe; ich pobieranie i wszystkie zapisy pozostają bez zmian,
- dodano test `test:smoke:cache-first-refresh`; brak zmian logowania, SQL, tabel, RLS, uprawnień, Storage, zdjęć i Edge Functions.

## 9.38
- mobile/pracownik: ostatnio pobrane karty montaży, komentarze i dane urządzeń są przechowywane w IndexedDB osobno dla każdego konta i dostępne po utracie internetu,
- komentarze, dane urządzeń/numerów seryjnych oraz żądanie zakończenia montażu mają trwałą kolejkę offline; zdjęcia i tabliczki korzystają z istniejącej kolejki plików,
- automatyczna synchronizacja działa po zdarzeniu `online`, cyklicznie w tle oraz po ręcznym użyciu przycisku synchronizacji,
- kolejność synchronizacji chroni zakończenie montażu: najpierw zdjęcia tabliczek, potem urządzenia i komentarze, na końcu status po serwerowej weryfikacji kompletu tabliczek,
- zapis komentarza ma identyfikator UUID generowany na telefonie, co zapobiega podwójnym komentarzom podczas ponowień,
- zmiany statusu i urządzeń mają kontrolę konfliktu względem stanu bazowego; aplikacja nie nadpisuje późniejszej zmiany administratora,
- Centrum synchronizacji pokazuje razem zdjęcia i zmiany danych, obsługuje ręczne ponowienie oraz odrzucenie lokalnej zmiany w konflikcie,
- dodano cache aplikacji w istniejącym `push-sw.js`; wcześniej uruchomiona aplikacja i załadowane moduły mogą wystartować bez sieci,
- ręczna ikona odświeżenia uruchamia bezpieczną synchronizację zamiast twardego przeładowania strony,
- tworzenie nowego klienta bez internetu jest jawnie blokowane, aby nie tworzyć konfliktów i duplikatów kontrahentów,
- wylogowanie usuwa lokalny snapshot kart, natomiast kolejki robocze pozostają przypisane do identyfikatora właściwego użytkownika,
- dodano test `test:smoke:mobile-full-offline`; brak migracji SQL, zmian tabel, RLS i Edge Functions.

## 9.37
- desktop i mobile: komentarz zapisany przez pracownika uruchamia powiadomienie push do wszystkich administratorów z aktywną subskrypcją,
- kliknięcie powiadomienia otwiera kartę właściwego montażu; treść komentarza nie jest umieszczana w systemowym powiadomieniu,
- Edge Function sprawdza zalogowanego autora, rekord komentarza, zgodność `job_id` oraz dostęp przez głównego montera lub `job_access`, zanim użyje klucza serwisowego do wysyłki,
- komentarze administratora nie generują push, a typ logu `job_comment:<comment_id>` zabezpiecza przed podwójną wysyłką tego samego komentarza do tego samego administratora,
- nieudana wysyłka push nie cofa zapisanego komentarza ani istniejącego powiadomienia wewnątrz aplikacji,
- dodano test `test:smoke:comment-admin-push` dla desktopu, mobile, kontroli dostępu, antyduplikacji i odporności zapisu na awarię push,
- brak migracji SQL; po publikacji aplikacji trzeba ponownie wdrożyć Edge Function `send-assignment-push`.

## 9.36
- desktop i mobile: galeria `Zdjęcia montażu` oraz galeria tabliczek znamionowych mają osobne listy nawigacji,
- naprawiono przypadek, w którym tabliczki były poprawnie ukryte wśród miniaturek, ale pojawiały się po użyciu strzałki `następne` lub `poprzednie`,
- otwarcie zwykłego zdjęcia przekazuje do podglądu wyłącznie zwykłe zdjęcia, a otwarcie tabliczki przy JZ/JW wyłącznie tabliczki,
- podgląd obsługuje teraz także awaryjne adresy `signed_url`, `original_image_url` i `local_preview_url`,
- zmiana zlecenia czyści aktywny podgląd i kontekst galerii, aby zdjęcia nie mieszały się między kartami,
- brak migracji SQL, zmian Supabase, Edge Functions, Storage i RLS.

## 9.35
- desktop administratora: kreator `Urządzenia` został zwężony z 700 px do maksymalnie 540 px i otrzymał spokojny, neutralny wygląd premium,
- naprawiono rzeczywistą przyczynę szerokich pasów po bokach: wewnętrzny `.mobileDeviceWizard` wypełnia teraz 100% modalu mimo globalnego centrowania `.modal`,
- promień zewnętrznego okna zmniejszono do 18 px, a nagłówek ma kompaktowe kwadratowe przyciski cofnięcia i zamknięcia,
- karta urządzenia ma 78 px, przycisk dodania 40 px, a boczne odstępy obszaru roboczego 18 px,
- jaskrawy niebieski przycisk zapisu zastąpiono grafitowym; pozostałe akcenty są neutralne, a zieleń pozostaje wyłącznie przy poprawnym statusie tabliczek,
- mobile, Supabase, SQL, Edge Functions, Storage i RLS pozostają bez zmian.

## 9.34
- desktop administratora: przebudowano wygląd okna `Urządzenia` otwieranego z akcji `Dodaj / edytuj urządzenia i tabliczki`,
- usunięto wymuszoną wysokość kreatora, która przy jednym urządzeniu tworzyła dużą pustą białą powierzchnię; wysokość dopasowuje się teraz do treści, a dłuższe etapy zachowują przewijanie,
- modal ma profesjonalną hierarchię powierzchni: biały nagłówek i stopkę, jasnoszare tło robocze oraz oddzielne białe karty urządzeń,
- karta urządzenia, status tabliczek, oznaczenie Single/Multi i ikona zostały uporządkowane; dodano dyskretny stan najechania,
- `Dodaj kolejne urządzenie` jest kompaktowym przyciskiem 48 px zamiast dużego pustego panelu,
- główna akcja ma etykietę `Zapisz urządzenia` i wyraźny niebieski styl; mobilny kreator zachowuje dotychczasowy wygląd i etykietę `Zapisz montaż`,
- brak migracji SQL, zmian Supabase, Edge Functions, Storage i RLS.

## 9.33
- błędy Supabase `500`, `502`, `503`, `504`, timeouty i chwilowe problemy z połączeniem pokazują komunikat `Serwer chwilowo przeciążony — spróbuj ponownie`, zamiast technicznego komunikatu mogącego sugerować błąd autoryzacji,
- klasyfikacja działa wspólnie dla logowania, przywracania sesji, odświeżania danych oraz zapisów montaży, kontrahentów i urządzeń na desktopie i mobile,
- aplikacja zachowuje lokalnego użytkownika podczas przejściowej awarii i automatycznie ponawia przywracanie danych co 5 sekund; stan jest czyszczony dopiero po rzeczywistym zdarzeniu `SIGNED_OUT`,
- błędy `401/403`, wygaśnięty JWT, RLS i brak uprawnień pozostają odrębnymi błędami autoryzacji,
- zapisanie montera nie jest już cofane ani oznaczane jako nieudane tylko dlatego, że osobna wysyłka push chwilowo się nie udała,
- brak migracji SQL, zmian Edge Functions, Storage i RLS.

## 9.32
- desktop/tabliczki: lokalny odczyt nadrukowanego modelu korzysta teraz z pełnego wbudowanego katalogu 214 pozycji EAN i 213 unikalnych kodów modeli Rotenso, zamiast ograniczać się do pojedynczych reguł,
- typowe pomyłki obrazu `S/5`, `O/0`, `I/1`, `L/1`, `B/8`, `Z/2`, `G/6` oraz dodatkowe odstępy są korygowane wyłącznie przez dopasowanie do potwierdzonego kodu katalogowego,
- `ES50Xi R17` i warianty odczytu `ESSOXi`, `ES5OXi`, `ES5 0X1` uzupełniają `Rotenso`, `Elis Silver 5,0 kW`, JW i powiązany EAN `5905567614293`,
- pozycja katalogowa może zostać zaakceptowana po jednym jednoznacznym dopasowaniu nawet przy niskiej ogólnej pewności OCR; nadal nie są zapisywane wartości spoza katalogu,
- dodano szerszy wariant przygotowania obrazu dla nadruków modelu w górnej lewej części etykiety,
- numer seryjny nadal pochodzi wyłącznie z Code 128/39, a `Odczytaj kody` nie uruchamia OpenAI,
- brak migracji SQL, zmian Edge Functions, Storage i RLS.

## 9.31
- desktop/tabliczki: niebieski przycisk `Odczytaj kody` po odczycie EAN/Code 128 uruchamia lokalne rozpoznawanie wyłącznie krótkiego, nadrukowanego kodu modelu Rotenso,
- lokalny odczyt działa bez OpenAI i bez fioletowego przycisku AI; wynik jest przyjmowany tylko po dopasowaniu do słownika oraz dwóch zgodnych przebiegach albo jednym przebiegu o wysokiej pewności,
- przypadek `EO50Xo R17` uzupełnia `Rotenso`, `Elis 5,0 kW`, moc `5,0 kW` i jednostkę zewnętrzną JZ; typowe pomyłki obrazu `EOSOXo` / `EO5OXo` są korygowane wyłącznie po pewnym dopasowaniu słownikowym,
- lokalny odczyt nie analizuje i nie zapisuje numeru seryjnego — SN nadal pochodzi wyłącznie z Code 128, dzięki czemu nie wracają dawne pomyłki szerokiego OCR,
- funkcja dotyczy tylko desktopowego okna tabliczki; mobile pozostaje bez OCR,
- brak migracji SQL, zmian Edge Functions, Storage i RLS.

## 9.30
- desktop/tabliczki/AI: dokładny kod modelu Rotenso jest teraz wyszukiwany nie tylko w polu `model_code`, ale też w pełnej transkrypcji i notatkach analizy AI,
- etykiety takie jak `EO50Xo R17` uzupełniają automatycznie `Rotenso`, `Elis 5,0 kW`, typ jednostki zewnętrznej i moc `5,0 kW`, nawet gdy AI umieści kod w `raw_text`,
- instrukcja analizy obrazu wymusza sprawdzenie krótkiego nadruku nad kodem kreskowym i zapis kodów Xi/Xo/Xm do pola modelu,
- numer seryjny odczytany z Code 128 nadal ma pierwszeństwo i nie jest mieszany z modelem ani EAN-em,
- brak migracji SQL i brak zmian w Supabase Storage lub Edge Functions.

## 9.29
- desktop administratora: dodano w szczegółach montażu akcję `Dodaj / edytuj urządzenia i tabliczki`,
- desktop: akcja otwiera ten sam kreator Single/Multi, modeli, mocy i zdjęć tabliczek co workflow mobilny,
- desktop: dodano bezpośredni zapis zdjęć tabliczek do prywatnego bucketu `job-photos` w katalogu `nameplates`,
- desktop: formularz edycji ładuje istniejące tabliczki i zachowuje je podczas dopisywania kolejnych urządzeń/JW,
- mobile administratora: akcja `Urządzenia` otwiera istniejący kreator urządzeń i tabliczek; pracownik zachowuje akcję `Tabliczki`,
- brak migracji SQL i brak zmian Edge Functions.

## 9.28
- desktop/tabliczki: dodano automatyczne prostowanie obrazu po nieudanym standardowym odczycie kodów kreskowych,
- czytnik próbuje kąty od -18° do +18° co 3°, w wariancie normalnym i kontrastowym,
- retry działa dla uniwersalnego lokalnego dekodera, natywnego BarcodeDetector i lokalnego dekodera EAN-13,
- standardowy szybki odczyt pozostaje pierwszy; prostowanie uruchamia się wyłącznie, gdy nadal brakuje EAN lub SN,
- brak OCR i brak automatycznego AI — `Odczytaj przez AI` pozostaje ręczną opcją awaryjną.

## 9.27
- desktop i mobile: kolejne nagranie komentarza administratora dopisuje tekst do istniejącego komentarza zamiast go zastępować; każde nagranie trafia do nowej linii.

## 9.25
- desktop: dodano `VoiceNoteButton` przy polu `Komentarz administratora` w formularzu nowego i edytowanego zlecenia,
- mikrofon jest stałą prawą kolumną pola komentarza, a rozpoznany tekst zapisuje się bezpośrednio do `admin_note`,
- sesja głosowa używa istniejącego okna `Nagrywanie komentarza` i przycisku `Zakończ nagrywanie`,
- komunikat o braku obsługi wskazuje Chrome/Edge na komputerze,
- mobile bez zmian funkcjonalnych; brak SQL i zmian Supabase.

## 9.24
- desktop administratora / Montaże: po otwarciu szczegółów zlecenia lewa lista i prawy panel mają niezależne przewijanie pionowe,
- lewy panel przechwytuje pionowe kółko myszy przed wewnętrznym `tableWrap`, więc lista przewija się również wtedy, gdy kursor znajduje się bezpośrednio nad tabelą,
- wysokość split-view została ograniczona do bieżącego viewportu (`100dvh`), aby obszar przewijania nie wychodził pod dolną krawędź ekranu,
- prawy panel szczegółów zachowuje własny scroll; mobile bez zmian.

## 9.23
- nowy/edytowany montaż: usunięto z formularza przełączniki `Zgoda na SMS` i `Aktywne przypomnienia`; oba ustawienia są zapisywane automatycznie jako włączone, bez klikania,
- usunięto stały opis `Mów naturalnie, bez komend i bez podawania nazw pól`, aby skrócić mobilny formularz; samo dyktowanie i okno `Zakończ i sprawdź` pozostają bez zmian,
- nie zmieniono historycznych rekordów w bazie; wymuszenie `true` działa dla nowych i ponownie zapisywanych zleceń,
- dodano test `test:smoke:mobile-new-job-sms-defaults`.

## 9.22
- mobile administrator: naprawiono realny układ formularza zamiast kolejnego nadpisania media-query; komentarz korzysta z tego samego `voiceFieldRow` co pola Miejscowość/Ulica,
- mikrofon komentarza jest stałą drugą kolumną 44 px po prawej stronie textarea,
- puste akcje `Wyczyść datę` i `Wyczyść komentarz` są ukryte, dzięki czemu formularz jest krótszy i czytelniejszy,
- data ma własną ramkę `installationDateInputShell`; natywny `input[type=date]` nie dziedziczy już ogólnego `.input`, co eliminuje wychodzenie prawego zaokrąglenia poza modal na iOS,
- krytyczny layout ma zabezpieczenie zarówno w JSX, jak i końcowym bloku CSS poza media-query.

## 9.21
- mobile administrator: przebudowano `Komentarz administratora` na stabilny układ `pole + mikrofon`, dzięki czemu mikrofon nie spada już pod pole i pozostaje po prawej stronie jak przy `Miejscowość`,
- komentarz został dodatkowo obniżony do kompaktowych 2 wierszy, przy zachowaniu modalu `Nagrywanie komentarza` i przycisku `Zakończ nagrywanie`,
- sekcja `Data montażu` ma etykietę i `Wyczyść datę` w jednym kompaktowym wierszu,
- pole `input[type=date]` ma osobne ograniczenia szerokości dla iOS (`inline-size`, `max-inline-size`, `appearance:none`), aby prawa krawędź i zaokrąglenie nie wychodziły poza modal,
- bez zmian: instalatorzy są ukryci przy dodawaniu nowego zlecenia i dostępni dopiero przy edycji.

## 9.20
- mobile administrator: pole `Komentarz administratora` w nowym/edytowanym montażu jest niższe i bardziej kompaktowe, a mikrofon znajduje się po prawej stronie pola,
- dyktowanie komentarza administratora otwiera jawne okno `Nagrywanie komentarza` z podglądem rozpoznawanego tekstu i przyciskiem `Zakończ nagrywanie`,
- po zakończeniu nagrywania rozpoznany tekst jest wpisywany bezpośrednio do komentarza administratora,
- podczas tworzenia nowego montażu ukryto sekcję `Instalatorzy (opcjonalnie)`; sekcja pozostaje dostępna przy edycji istniejącego zlecenia,
- dodano test `test:smoke:mobile-new-job-comment`.

## 9.19
- mobile administrator: Diagnostyka została schowana pod kompaktowym przyciskiem `D` obok przeładowania; menu zawiera test push na bieżący telefon i pobranie raportu,
- mobile administrator: `Komentarz administratora` można wprowadzić głosowo przez mikrofon przy polu komentarza,
- mobile pracownik: dodano przycisk `+` i formularz dodania nowego klienta/zlecenia,
- zlecenie utworzone przez pracownika ma wymuszony status `Nowe` i `main_technician_id = null`; pracownik-twórca nie jest ustawiany jako główny monter,
- twórca dostaje tylko wpis `job_access`, aby mógł widzieć utworzone zlecenie do czasu decyzji administratora o obsadzie,
- dodawanie kontrahenta przez pracownika korzysta z ograniczonej funkcji `worker_create_or_get_contractor_for_job` SECURITY DEFINER; funkcja nie udostępnia katalogu kontrahentów ani prywatnych danych istniejących klientów,
- dodano test `test:smoke:mobile-worker-add-client`.

## 9.18
- mobile administrator: dodano jawny panel `Diagnostyka` pod sekcją Push; test konkretnego telefonu i raport diagnostyczny nie są już ukryte pod ikoną dokumentu w nagłówku,
- nagłówek administratora ma tylko dwie akcje (`Dodaj`, `Przeładuj`), dzięki czemu wersja ma więcej miejsca i układ pozostaje równy na iPhonie,
- mobilna synchronizacja Web Push nie zapisuje już `push_subscriptions` bezpośrednio z klienta; używa uwierzytelnionej Edge Function,
- naprawiono przypadek jednego iPhone'a używanego kolejno na różnych kontach: backend może przepisać istniejący endpoint do aktualnie zalogowanego użytkownika tylko po potwierdzeniu zgodności `p256dh` i `auth`,
- wyłączanie subskrypcji także przechodzi przez backend i weryfikuje klucze urządzenia,
- nie poluzowano RLS tabeli `push_subscriptions`,
- Edge Function `send-assignment-push` zaktualizowano do obsługi `sync_subscription` i `disable_subscription`, zachowując `push_test`, `job_completed` i `job_assigned`,
- dodano test `test:smoke:push-mobile-reassignment`.

## 9.17
- push: `Push aktywne` oznacza teraz aktywną subskrypcję potwierdzoną także po stronie Supabase, a nie tylko lokalny wpis w PushManager,
- przy wejściu/powrocie do aplikacji automatycznie odświeżane są endpoint, klucze, `is_active` i `last_seen_at` bieżącej subskrypcji,
- desktopowa Diagnostyka administratora otrzymała testowe powiadomienie push do jego aktywnych urządzeń bez zamykania zlecenia,
- mobilna ikona Diagnostyki administratora otwiera menu z testem push na dokładnie bieżący telefon oraz pobraniem raportu,
- Edge Function `send-assignment-push` obsługuje admin-only zdarzenie `push_test` i opcjonalne filtrowanie konkretnego endpointu,
- `job_completed` ma kontrolowany retry odczytu statusu po stronie Edge Function oraz retry klienta tylko dla HTTP 409,
- wynik testu push jest zapisywany w `push_delivery_log` jako typ `push_test`,
- dodano test `test:smoke:push-reliability` do pełnego, mobilnego i desktopowego release runnera,
- brak nowej migracji SQL; należy ponownie wdrożyć Edge Function `send-assignment-push`.

## 9.16
- mobile administrator: przy tworzeniu nowego montażu z przycisku `+` usunięto całą sekcję `Urządzenia w montażu`, typy single/multi, modele, numery seryjne i zdjęcia tabliczek,
- nowy montaż zapisuje się bez danych urządzeń; puste domyślne pola nie są zapisywane jako urządzenie,
- urządzenia i tabliczki pozostają dostępne po utworzeniu montażu: przy edycji istniejącego zlecenia oraz w osobnym kreatorze tabliczek,
- nie zmieniono blokady zakończenia zlecenia wymagającej zdjęć tabliczek JW/JZ,
- desktop pozostaje bez zmian,
- dodano test `test:smoke:mobile-new-job-no-devices` do pełnego i mobilnego release runnera,
- brak nowej migracji SQL.

## 9.15
- mobile administrator: przebudowano górny pasek tak, aby wersja i akcje nie zawijały się ani nie przesuwały względem siebie,
- menu modułów na iPhonie ma cztery równe kolumny i ograniczone skalowanie tekstu, co usuwa nachodzące napisy,
- dodano `viewport-fit=cover` i obsługę `safe-area-inset-*`, aby menu nie wchodziło pod systemowy pasek iOS,
- usunięto osobną ikonę wylogowania administratora; kliknięcie pola z nazwą administratora wylogowuje,
- pracownik zachowuje własną ikonę wylogowania, ponieważ kliknięcie jego nazwy ma inną funkcję,
- przycisk odświeżania wykonuje teraz rzeczywiste `window.location.reload()` zamiast niewidocznego dla użytkownika samego pobrania danych przez `refreshAll()`,
- dodano test `test:smoke:mobile-admin-header`, również do pełnego i mobilnego release runnera,
- brak nowej migracji SQL.

## 9.14
- dodano `jobs.completed_at` i `jobs.completed_by` oraz trigger zapisujący rzeczywistą chwilę i autora przejścia do statusu `Zakończone`,
- administrator widzi datę i godzinę zakończenia w szczegółach zlecenia zarówno na desktopie, jak i w widoku mobilnym,
- historyczne zlecenia zakończone przed 9.14 nie dostają sztucznej daty; brak dokładnego czasu jest jawnie oznaczony,
- po przejściu do `Zakończone` aplikacja wywołuje push `job_completed`; nieudany push nie cofa zakończenia,
- istniejąca Edge Function `send-assignment-push` została rozszerzona o bezpieczną obsługę zakończeń i wysyła systemowy web push do aktywnych subskrypcji administratorów,
- Edge Function weryfikuje status zlecenia w bazie oraz dostęp pracownika do wskazanego montażu,
- dodano ochronę przed ponownym wysłaniem tego samego push po tej samej chwili zakończenia,
- nowy SQL: `job-completion-tracking-v9.14.sql`; wymaga również ponownego wdrożenia Edge Function `send-assignment-push`,
- dodano test `test:smoke:job-completion`.

## 9.13
- desktopowa lista Montaże otrzymała kolumnę `Tabliczki` pomiędzy `Monter` i `Data montażu`,
- status jest agregowany dla wszystkich oczekiwanych JZ/JW: zielone `Potwierdzone`, czerwone `Niepotwierdzone` z licznikiem oraz neutralne `Brak urządzeń`,
- administrator może ręcznie potwierdzić konkretną JZ/JW również bez zdjęcia; ręczne potwierdzenie można cofnąć,
- zatwierdzony status zdjęcia (`photos.ocr_status = approved`) i ręczne potwierdzenie są równorzędne tylko dla desktopowego statusu administracyjnego,
- dodano tabelę `nameplate_manual_verifications` z unikalnością `job_id + device_index + unit_ref` i admin-only RLS,
- lista montaży pobiera lekki metadane tabliczek i ręcznych potwierdzeń bez pobierania obrazów,
- mobile nie korzysta z ręcznych potwierdzeń, więc obowiązek zdjęć przed zakończeniem montażu pozostaje nienaruszony,
- dodano test `test:smoke:desktop-nameplate-verification-status` dla single, multi, braku zdjęcia i ręcznego potwierdzenia.

## 9.12
- desktop: całkowicie usunięto lokalny OCR/Tesseract z odczytu tabliczek znamionowych oraz zasoby `public/ocr/`,
- interfejs odczytu tabliczki ma tylko dwie ścieżki: **Odczytaj kody** i **Odczytaj przez AI**,
- czytnik kodów nie używa już tekstowego fallbacku: EAN-13 oraz Code 128/39 mogą pochodzić wyłącznie z rzeczywistego dekodera kodów kreskowych,
- AI odczytuje nadrukowaną markę, model, moc i opcjonalnie SN/EAN, przy czym twardy EAN/SN z kodu kreskowego ma pierwszeństwo,
- model Rotenso odczytany przez AI uzyskuje status potwierdzonego wyłącznie po dokładnym dopasowaniu do katalogu; niepotwierdzony model AI jest blokowany przed automatycznym zapisem,
- zachowano rozdzielenie PC/EAN od SN oraz walidację Xi/JW, Xo/JZ i Xm/JZ dla całego katalogu 214 kodów,
- przebudowano testy regresyjne tabliczek pod architekturę barcode + AI bez lokalnego OCR,
- brak nowej migracji SQL; mobile bez zmian.

## 9.11
- desktop: dodano drugi profil tabliczki bez obowiązkowego EAN-u — nadrukowany kod modelu + Code 128 jako numer seryjny,
- dodano skupiony OCR górnej części etykiety (`scanDesktopNameplateModelCode`), który nie szuka dowolnego tekstu, tylko dokładnego kodu obecnego w katalogu Rotenso,
- model może zostać automatycznie przyjęty po dwóch zgodnych przebiegach OCR albo po jednym odczycie o wysokiej pewności,
- ograniczone korekty OCR `X1 -> Xi` oraz `X0 -> Xo` są dozwolone wyłącznie wtedy, gdy wynik odpowiada dokładnemu modelowi z katalogu,
- brak EAN-u nie uruchamia już pełnego fallbacku ani nie blokuje wyniku, jeśli model i SN są kompletne,
- kod modelu Rotenso nie może zostać zaklasyfikowany jako numer seryjny Code 128,
- dodano test `test:smoke:desktop-nameplate-layout-profiles` z realnym przypadkiem `R35Xi R18 / 140201BFT7N28261B000931`,
- zachowano wcześniejsze zabezpieczenia PC/EAN vs SN oraz Xi/JW, Xo/JZ, Xm/JZ dla 214 kodów,
- brak nowej migracji SQL; mobile bez zmian.

## 9.10
- desktop: dodano uniwersalny dekoder EAN-13/Code 128 oparty na `barcode-detector` 3.2.1 / ZXing WebAssembly, uruchamiany przed natywnym `BarcodeDetector`,
- skanowanie obejmuje kilka zachodzących pasów tabliczki, aby niezależnie łapać górny PC/EAN i dolny kod SN,
- `universal_barcode` i `native_barcode` mają pierwszeństwo przy numerze seryjnym przed OCR,
- automatyczny OCR SN nie może już zapisać pojedynczego lub urwanego kandydata; wymagany jest identyczny wynik z co najmniej dwóch przebiegów OCR przy jawnej etykiecie SN/Serial,
- usunięto z UI fallback wybierający najdłuższy ciąg alfanumeryczny z surowych detekcji,
- dodano test `test:smoke:desktop-nameplate-universal-reader` z przypadkiem `5905567600791 / 540S25420034B110171916` i błędnym fragmentem `0034B110171918`,
- zachowano pełną walidację 214 kodów Rotenso oraz poprawki JW/JZ z 9.09,
- brak nowej migracji SQL; mobile bez zmian funkcjonalnych.

## 9.09
- desktop OCR: EAN z fallbacku OCR jest akceptowany wyłącznie z pola `PC/EAN`, `EAN` lub `GTIN`; usunięto globalne wyszukiwanie 13-cyfrowych okien w całym tekście tabliczki,
- desktop barcode: `printed_text` z `SN` oraz numeryczny `Code 128` nie mogą zostać awansowane do EAN-13,
- naprawiono błąd `target.unitRef === 'JZ'` przy rzeczywistej wartości `jz`, który mógł zapisywać JZ jako `indoor` w centralnym katalogu,
- klasyfikacja urządzenia opiera się najpierw na kodzie modelu: `Xi=JW`, `Xo=JZ`, `Xm=JZ`, a dopiero potem na polu `unit_type`,
- oficjalny wbudowany katalog Rotenso jest źródłem nadrzędnym dla znanych EAN-ów i nie może być nadpisany przez `confirmed_scan`,
- dodano test `test:smoke:desktop-nameplate-ean-separation` z realnymi przypadkami I35Xi/I35Xo i kontrolą wszystkich 214 kodów Rotenso,
- dodano idempotentny SQL `nameplate-product-catalog-repair-official-v9.09.sql` przywracający 183 aktualne oficjalne wpisy centralnego katalogu,
- mobile bez zmian.

## 9.08
- desktop: w formularzu „Nowy montaż / zlecenie” usunięto sekcję dodawania urządzeń; nowe zlecenie zapisuje klienta, adres, status, datę, komentarz administratora i instalatorów bez wymuszania danych urządzenia,
- desktop: sekcja urządzeń pozostaje dostępna przy edycji istniejącego montażu, więc starsze dane i ręczna korekta urządzeń nie zostały usunięte,
- desktop: menu boczne zostało lekko zagęszczone — tekst pozycji zmniejszono z 18 px do 17 px, pozycje z 58 px do 52 px oraz zmniejszono odstępy i ikony, aby ograniczyć pionowe przewijanie na niższym ekranie,
- mobile: bez zmian funkcjonalnych i wizualnych,
- brak nowej migracji Supabase.

## 9.07

- usunięto płatny fallback `MediaRecorder -> /api/transcribe-client-voice -> OpenAI` z głosowego wprowadzania danych klienta,
- dyktowanie klienta korzysta wyłącznie z natywnego `SpeechRecognition`/`webkitSpeechRecognition` dostępnego w przeglądarce,
- Chrome i Edge na desktopie oraz Safari na iPhonie pozostają obsługiwane, jeżeli przeglądarka udostępnia rozpoznawanie mowy,
- Firefox i inne przeglądarki bez Web Speech pokazują jasny komunikat o użyciu Chrome/Edge zamiast wysyłania nagrania do płatnego API,
- usunięto `api/transcribe-client-voice.js`; `OPENAI_API_KEY` pozostaje wyłącznie dla ręcznego odczytu tabliczek przez AI,
- parser 9.05 oraz poprawki naturalnego dyktowania 19/19, telefonu i e-maila pozostają bez zmian,
- brak nowej migracji Supabase.

## 9.06

**Głosowe dane klienta także na desktopie**

- `Wprowadź głosowo` działa na desktopie, nie tylko na iPhonie,
- Chrome/Edge używają natywnego Web Speech, gdy jest dostępne,
- Firefox i inne przeglądarki bez `SpeechRecognition` korzystają z `MediaRecorder` i serwerowej transkrypcji,
- dodano endpoint `api/transcribe-client-voice.js`, zabezpieczony ważną sesją Supabase,
- fallback używa istniejącego `OPENAI_API_KEY` oraz domyślnie modelu `gpt-4o-mini-transcribe`,
- nagrania nie są zapisywane w Supabase ani Storage,
- mikrofony przy pojedynczych polach również mają fallback desktopowy,
- komunikaty o błędach mikrofonu nie są już opisane wyłącznie jako błędy Safari/iPhone,
- brak nowej migracji Supabase.

## 9.05

**Naturalne głosowe wprowadzanie danych bez komend**

- usunięto wymóg wypowiadania nazw pól typu `telefon`, `e-mail`, `miasto` i `ulica`,
- telefon jest wykrywany jako osobny, spójny numer 9-cyfrowy lub `+48`, zamiast zbierania wszystkich cyfr z całej wypowiedzi,
- realny błąd z 9.04 (`19/19` + `606 606 909` → `1919606606909`) ma dedykowany test regresyjny,
- naturalny ciąg `Piotr Wasik Widna 19 przez 19 Zawiercie ... 606 606 909` jest rozbijany bez etykiet pól,
- e-mail jest rozpoz…28154 tokens truncated…ry tworzy tymczasowy katalog z fałszywym `node_modules`, częściowym `dist` oraz plikami roboczymi i sprawdza, że `scripts/release-zip.cjs` nie pakuje ich do ZIP-a.
- release/verify: `npm run verify:release` blokuje częściowy katalog `dist` po nieudanym buildzie, czyli `dist` bez `index.html` albo bez plików w `dist/assets`.
- release/runner: desktopowy i pełny flow release uruchamiają teraz także `test:smoke:release-zip`, żeby bezpieczne pakowanie było sprawdzane w każdym wydaniu.

## 7.60
- release/runner-smoke: dodano `test:smoke:release-runner`, który importuje `scripts/run-release.cjs` i sprawdza plan komend `full` oraz `desktop` bez uruchamiania builda.
- release/runner: `scripts/run-release.cjs` ma teraz `getReleasePlan()` oraz tryb `--dry-run` / `--list-commands`, żeby można było podejrzeć kolejność release bez wykonywania smoke, verify, build i ZIP.
- release/desktop: `release:desktop` obejmuje teraz także `test:smoke:release-runner`, więc desktopowa checklista pilnuje samego runnera.
- zip/release: przebudowano `scripts/release-zip.cjs`, żeby zbierał jawną, posortowaną listę plików i pakował ją przez `zip -@`, zamiast używać rekurencyjnego `zip -r`; dzięki temu lokalne `node_modules`, `dist` i inne katalogi robocze są pomijane zanim ZIP zacznie pakowanie.
- dokumentacja: zaktualizowano `README.md`, `RELEASE-CHECKLIST.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`, `app-version.json` i `src/version.js` do wersji `7.60`.

## 7.59
- release/runner: przeniesiono długą komendę `npm run release` z `package.json` do nowego pliku `scripts/run-release.cjs`, żeby utrzymać flow wydania w czytelnym kodzie Node.
- release/desktop: dodano `npm run release:desktop`, który uruchamia desktopową checklistę: `version:bump`, smoke x2 z `test:smoke:desktop-only`, `verify:release` x2, `build` x2, `zip:release` i `verify-release --require-zip`.
- verify/release: rozszerzono `scripts/verify-release.cjs`, żeby pilnował obecności `scripts/run-release.cjs`, krótkich skryptów `release` i `release:desktop` oraz dokumentacji nowego flow.
- dokumentacja: zaktualizowano `README.md`, `RELEASE-CHECKLIST.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`, `app-version.json` i `src/version.js` do wersji `7.59`.
- build/runner: dopisano jawne zakończenie sukcesem w `prepare:deps` i `prepare:bins`, żeby release runner nie wisiał po poprawnej kontroli zależności albo chmod binarek.

## 7.58
- smoke/desktop-only: dodano `test:smoke:desktop-only`, który blokuje release desktopowy, jeżeli przypadkiem zmieni się `MobileJobsLayout.jsx` albo rozdzielenie layoutów mobile/desktop w `JobsPanel`.
- dokumentacja/release: dodano `RELEASE-CHECKLIST.md` z krótką procedurą smoke x2, verify x2, build x2, ZIP i verify ZIP.
- release: `README.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`, `app-version.json` i `src/version.js` podbito do wersji `7.58`.
- smoke/runner: dopisano jawne zakończenie procesu po poprawnych smoke testach, żeby długie przebiegi release nie zostawiały wiszących procesów Node.

## 7.57
- montaże/desktop: tabela zleceń pokazuje teraz maksymalnie 10 pozycji na stronę i dostała stopkę paginacji z zakresem rekordów oraz przyciskami poprzednia/następna strona.
- montaże/mobile: lista kart zleceń korzysta z tej samej paginacji po 10 pozycji, więc długie listy nie przewijają się już jednym ciągiem.
- logika/listy: paginacja resetuje się do pierwszej strony po zmianie statusu, wyszukiwarki, sortowania albo przełączeniu widoku przypisanych zleceń.
- smoke/release: rozszerzono `test:smoke:selection`, żeby pilnował rozmiaru strony, przekazywania `pagedVisibleJobs` i wspólnego komponentu `JobsPagination`.

## 7.56
- montaże/desktop: w kolumnie `Data montażu` dodano mały znacznik `Brak daty`, gdy zlecenie nie ma ustawionego `installation_date`, żeby braki były widoczne od razu w tabeli statusów.
- wydajność/admin: moduły `SMS`, `Kontrahenci`, `Urządzenia` i `Kalendarz` zostały przeniesione na lazy loading w `src/App.jsx`, dzięki czemu nie wchodzą już do głównego chunka startowego.
- layout/admin: widok `Kalendarz` jest traktowany jak pojedynczy moduł administratora w desktopowym układzie, tak samo jak `SMS`, `Kontrahenci` i `Urządzenia`.
- smoke/release: uszczelniono `test:smoke:lazy`, `test:smoke:suspense` i `test:smoke:selection`, żeby pilnowały lazy importów modułów administratora oraz znacznika braku daty montażu.

## 7.55
- montaże/desktop: kolumna `Data montażu` w tabeli zleceń pokazuje teraz `installation_date`, a nie `created_at`, dzięki czemu lista statusów pokazuje termin montażu zamiast daty dodania zlecenia.
- montaże/mobile: karta zlecenia pokazuje tę samą datę montażu co desktop, zgodnie z wyjątkową zmianą dopuszczoną dla wersji mobilnej.
- sortowanie: sortowanie po kolumnie daty w module `Montaże` działa teraz według daty montażu.
- smoke/release: rozszerzono `test:smoke:selection`, żeby pilnował użycia `installation_date` w widoku desktopowym, mobilnym oraz sortowaniu.

## 7.54
- sidebar/logo: naprawiono faktyczną przyczynę zbyt małego logo WAWIS — globalna reguła `img { width:40% !important; max-width:40% !important; }` nadpisywała logo w sidebarze.
- CSS/admin: dodano dla `adminDesktopBrandLogo` reguły `width:100% !important`, `max-width:none !important` i `height:auto !important`, żeby baner realnie wypełniał szerokość lewego menu.
- smoke/release: rozszerzono `test:smoke:desktop-refresh`, żeby pilnował również nadpisania globalnej reguły `img` dla logo WAWIS.

## 7.53
- sidebar/logo: usunięto ograniczenie `max-width` z logo WAWIS i rozciągnięto kontener brandu poza wewnętrzny padding sidebara, żeby baner zajmował faktycznie całą szerokość lewego menu.
- smoke/release: rozszerzono `test:smoke:desktop-refresh`, żeby pilnował braku `max-width` oraz reguły pełnej szerokości brandu.

## 7.52
- sidebar/logo: baner `WAWIS` w lewym menu został poszerzony na pełną dostępną szerokość sidebaru, zamiast wyświetlać się jako zbyt wąski znak.
- smoke/release: rozszerzono `test:smoke:desktop-refresh`, żeby pilnował obecności logo WAWIS i reguły szerokości `adminDesktopBrandLogo`.

## 7.51
- calendar/admin: dodano desktopowy moduł `Kalendarz`, otwierany z lewego menu, z miesięczną siatką dni i listą montaży przypisanych do konkretnych dat.
- calendar/ux: kliknięcie dnia pokazuje zlecenia z wybranego dnia, a kliknięcie wpisu montażu przechodzi do modułu `Montaże` i otwiera wybrane zlecenie.
- sidebar/branding: podmieniono dotychczasowe logo `CoolSystem` na baner `WAWIS Chłodnictwo i Klimatyzacja` w lewym panelu administratora.
- smoke/release: dodano `npm run test:smoke:calendar-sidebar`, który pilnuje wejścia `Kalendarz`, renderowania modułu kalendarza oraz obecności logo WAWIS.

## 7.50
- SMS/ustawienia: po kliknięciu `Szablony SMS` albo `Ustawienia` w lewym menu administratora wyświetla się teraz wyłącznie widok ustawień modułu SMS, bez górnych kafelków, filtrów, kolejki, historii wysyłek i tabel.
- SMS/UX: `Szablony SMS` mają własny tytuł i opis nastawiony na edycję treści wiadomości, a `Ustawienia` mają własny opis konfiguracji modułu.
- smoke/release: rozszerzono `test:smoke:sidebar-settings`, żeby pilnował osobnego trybu `smsSettingsOnlyPage` i nie dopuścił do powrotu pełnego modułu SMS pod wejściami ustawień.

## 7.49
- SMS/desktop: uproszczono górne kafelki `Klienci na liście` i `Wysłane w tym miesiącu` — usunięto duże ikony, dodatkowe etykiety liczników oraz znaczek `aktywny kafelek`, żeby moduł wyglądał spokojniej i spójniej.
- SMS/filtry: usunięto dekoracyjną etykietę `większe filtry`; pasek filtrów został bardziej rzeczowy i mniej zaśmiecony.
- SMS/tabele: poszerzono układ tabel oraz usunięto kolumnę `Akcje`; klient jest klikalny bezpośrednio w kolumnie `Klient`, a numer seryjny jest klikalny w kolumnie `Numer seryjny`, dzięki czemu nie trzeba otwierać menu `...`.
- SMS/dane: dodano kartę `Dane urządzenia` po kliknięciu numeru seryjnego, a kliknięcie klienta otwiera kartę `Dane klienta`.
- smoke/release: zaktualizowano smoke testy desktopowego odświeżenia i podglądu klienta/urządzenia, żeby pilnowały nowego układu bez dropdownu akcji.

## 7.48
- montaże/desktop: kolumna `Monter` została poszerzona do `132px`, a rząd okrągłych badge’y monterów ma teraz `100px` i `nowrap`, dzięki czemu minimum trzy badge’e mieszczą się w jednej linii, a nagłówek `Monter` nie jest ucinany.
- urządzenia/desktop: nazwa klienta w tabeli urządzeń jest teraz klikalna i otwiera modal `Dane klienta` z adresem/miastem, telefonem, e-mailem, urządzeniem, numerem seryjnym, datą montażu i źródłem danych.
- smoke/release: rozszerzono `test:smoke:desktop-refresh`, żeby pilnował szerokości `Monter`, układu badge’y oraz klikalnego klienta w module `Urządzenia`.

## 7.47
- montaże/desktop: zaakceptowany układ kolumn został utrwalony w kodzie — kolumna `Status` pracuje na szerokości treści (`1%` + `fit-content` badge), więc `Nowe` jest wąskie, a `W realizacji` rozszerza się w jednym rzędzie bez łamania.
- montaże/desktop: kolumna `Klient` została ustawiona na `480px`, żeby przejąć wolną przestrzeń po zwężeniu statusu i lepiej mieścić dłuższe nazwy klientów.
- SMS/desktop: utrzymano tabelę bez kolumny `Termin serwisu`; `Numer seryjny` ma szerszą kolumnę i łamanie długich ciągów, żeby nie nachodził na inne dane.
- smoke/release: `test:smoke:desktop-refresh` pilnuje teraz układu `table-layout: auto`, `fit-content` badge’a statusu, klienta `480px` oraz braku `Terminu serwisu` w tabeli kolejki SMS.

## 7.46
- montaże/desktop: tabela zleceń przeszła na układ `table-layout: auto`, dzięki czemu kolumna `Status` zwęża się do realnej szerokości badge'a zamiast zajmować szeroki blok; jednocześnie kolumna `Klient` została poszerzona do `420px`, żeby oddać więcej miejsca nazwie klienta.
- SMS/desktop: utrzymano uproszczoną tabelę bez `Terminu serwisu`, a szerokość i łamanie `Numeru seryjnego` nadal pilnują, żeby numer był czytelny i nie nachodził już na sąsiednie kolumny.
- smoke/release: rozszerzono `test:smoke:desktop-refresh`, żeby pilnował nowej szerokości klienta (`420px`) i automatycznego układu tabeli `Montaże`, który zwęża kolumnę `Status` do rozmiaru badge'a.

## 7.45
- montaże/desktop: badge w kolumnie `Status` nie rozciąga się już na całą szerokość komórki, tylko dopasowuje się do długości tekstu (`Nowe`, `W realizacji` itd.), a kolumna `Klient` została dodatkowo poszerzona do `360px`, żeby zostawić więcej miejsca na nazwę klienta.
- SMS/desktop: z tabeli kolejki usunięto kolumnę `Termin serwisu`, dzięki czemu `Numer seryjny` dostał więcej szerokości i nie nakłada się już na sąsiednią kolumnę; wprowadzono też łamanie długich numerów seryjnych dla lepszej czytelności.
- desktop/spójność: nagłówki tabel `Montaże`, `SMS`, `Urządzenia` i `Kontrahenci` korzystają teraz z tej samej kapitalizacji i wagi, żeby całość wyglądała bardziej jak jeden, spójny komplet.
- smoke/release: rozszerzono `test:smoke:desktop-refresh`, żeby pilnował nowej szerokości klienta, zwężonego badge'u statusu w `Montażach` oraz braku `Terminu serwisu` i poszerzonego `Numeru seryjnego` w tabeli kolejki `SMS`.

## 7.44
- montaże/desktop: kolumna `Status` w tabeli zleceń została ustawiona na szerokość `auto`, a kolumna `Klient` została poszerzona do `320px`, żeby dłuższe nazwy klientów były czytelniejsze bez zabierania miejsca adresowi.
- SMS/desktop: z obu tabel modułu `SMS` usunięto kolumny `Miasto` i `Kontakt`, a szerokość klienta została zwiększona przez nowy układ kolumn, dzięki czemu nazwa klienta i adres są lepiej widoczne.
- smoke/release: rozszerzono `test:smoke:desktop-refresh`, żeby pilnował nowej szerokości kolumn w `Montażach` oraz braku kolumn `Miasto` i `Kontakt` w widokach tabel `SMS`.

## 7.43
- montaże/desktop: zwężono kolumnę `Status` w tabeli zleceń i poszerzono kolumnę `Klient`, żeby dłuższe nazwy klientów miały więcej miejsca, a status zajmował wyraźnie mniej szerokości.
- SMS/nawigacja: pozycje `Szablony SMS` i `Ustawienia` w lewym menu administratora otwierają teraz kartę ustawień SMS z treścią szablonu, więc da się już wejść z sidebara prosto do edycji szablonu i ustawień modułu.
- desktop/typografia: ujednolicono nagłówki drugiego poziomu (`Lista urządzeń`, `Przegląd urządzeń na desktopie`, `Wszyscy kontrahenci`, tytuł sekcji w `Montażach` i powiązane nagłówki kart), żeby cały desktop był spójny nie tylko w głównych tytułach modułów.
- smoke/release: dodano `npm run test:smoke:sidebar-settings` i dopięto go do release x2 oraz dokumentacji, żeby boczne wejścia `Szablony SMS` i `Ustawienia` nie wróciły już do pustego widoku.

## 7.42
- desktop/ui: ujednolicono styl nagłówków modułów `Montaże`, `Urządzenia`, `Kontrahenci` i `SMS`, tak aby korzystały z tej samej wielkości, wagi i koloru tytułu oraz tego samego kroju pisma.
- desktop/layout: nagłówki zostały przesunięte wyżej przez zmniejszenie górnych odstępów w topbarze i kartach nagłówkowych, dzięki czemu każdy moduł zaczyna się bliżej górnej krawędzi roboczej.
- smoke/release: rozszerzono `test:smoke:desktop-refresh`, żeby pilnował wspólnych reguł dla nagłówków desktopowych i nowych, mniejszych odstępów w shellu administratora.

## 7.41
- desktop/ui: ujednolicono szerokości i pionowe wyrównanie przycisków akcji w toolbarach modułów `SMS`, `Urządzenia`, `Kontrahenci` i `Montaże`, żeby cały desktop administratora miał jeden wspólny układ akcji.
- CSS/admin: dodano wspólne reguły `desktopToolbarActionBtn` oraz zmienne `--desktopModuleActionControlHeight`, `--desktopModuleActionTextButtonMinWidth` i `--desktopModuleActionGap`, które spinają wysokość, szerokość i odstępy przycisków tekstowych między modułami.
- smoke/release: rozszerzono `test:smoke:desktop-refresh`, żeby pilnował użycia wspólnych klas toolbarów i nowych zmiennych odpowiedzialnych za spójność przycisków akcji.

## 7.40
- desktop/ui: ujednolicono wysokość głównych nagłówków i toolbarów w modułach `SMS`, `Urządzenia`, `Kontrahenci` i `Montaże`, tak aby cały desktop administratora wyglądał jak jeden spójny system.
- CSS/admin: dodano wspólne zmienne `--desktopModuleHeaderMinHeight` i `--desktopModuleToolbarMinHeight`, a `smsDesktopHeaderCard`, `devicesHero`, `contractorsHero`, `smsDesktopFiltersCard`, `devicesToolbar`, `contractorsToolbar` oraz `desktopHeaderV2` korzystają teraz z jednego rytmu wysokości.
- smoke/release: rozszerzono `test:smoke:desktop-refresh`, żeby pilnował także nowych reguł spójności wysokości dla nagłówków i toolbarów desktopowych.

## 7.39
- urządzenia/desktop: z nagłówka modułu `Urządzenia` usunięto dodatkowe statystyki `Aktywne`, `Wymagają serwisu` i `Zdemontowane`; zostawiono tylko kartę `Wszystkie urządzenia`, zgodnie z uproszczonym widokiem administratora.
- SMS/desktop: z paska filtrów usunięto zakres dat oraz filtr `Wszystkie statusy`, zostawiając tylko wyszukiwarkę i `Wszystkie miasta`, a górne kafelki `Klienci na liście` i `Wysłane w tym miesiącu` zostały wyraźnie zmniejszone i zagęszczone.
- UI/typografia: odświeżono krój i wagę tekstu w desktopowych modułach administratora (`SMS`, `Urządzenia`, `Kontrahenci`, `Montaże`) na nowy, czytelniejszy systemowy stack `Inter / Segoe UI / Roboto / Arial`, żeby całość wyglądała lżej i nowocześniej.

## 7.38
- desktop/shell: usunięto lazy-loading modułów administratora `SMS`, `Kontrahenci` i `Urządzenia`, żeby po wejściu do `Urządzeń` nie dochodziło już do drugiego etapu dorysowywania widoku, który potrafił wyczyścić boczne menu i górny pasek po chwili od otwarcia modułu.
- desktop/css: sidebar i topbar administratora zostały dodatkowo usztywnione jako sticky/persistent, żeby lewy panel z menu i prawy górny panel użytkownika nie znikały podczas przejścia między modułami desktopowymi.
- smoke/release: rozszerzono `test:smoke:desktop-refresh`, żeby pilnował teraz także trwałości shella desktopowego (`adminDesktopSidebar` i `adminDesktopTopbar` w trybie sticky).

## 7.37
- desktop/ui: moduły `Montaże`, `Kontrahenci` i `Urządzenia` dostały kolejny etap ujednolicenia pod desktopowy shell administratora, żeby cała aplikacja była wizualnie spójniejsza z zaakceptowanym widokiem `SMS`.
- sidebar/admin: z lewego menu usunięto pozycje `Pulpit`, `Klienci` i `Przeglądy`, zostawiając tylko faktycznie używane sekcje robocze.
- SMS/desktop: zmniejszono oba górne kafelki (`Klienci na liście`, `Wysłane w tym miesiącu`) oraz usunięto desktopowy filtr `Wszystkie statusy` obok wyszukiwarki, żeby pasek filtrów był bardziej kompaktowy.

## 7.36
- SMS/desktop-admin: wdrożono wierny layout 1:1 względem zaakceptowanego mockupu dla modułu `SMS` — stały lewy sidebar z ikonami, górny pasek użytkownika, duży nagłówek, dwa duże kafelki podsumowania, szeroki desktopowy pasek filtrów i nowa tabela z akcjami w stylu z wizualizacji.
- SMS/UX: widok `Klienci na liście` i `Wysłane w tym miesiącu` korzysta teraz z tej samej, bogatszej tabeli z kolumnami klient/model/numer seryjny/miasto/kontakt/data/status/akcje, eksportem danych oraz dolnym paskiem informacyjnym i szybkim dostępem do ustawień szablonów SMS.
- app-shell/admin: dodano komponent `AdminDesktopShell`, który daje desktopowemu kontu administratora lewy sidebar, topbar użytkownika i spójny layout roboczy bez ruszania mobilki ani konta pracownika; smoke `test:smoke:desktop-refresh` został zaktualizowany pod nowy shell i nowy layout `SMS`.

## 7.35
- desktop/ui: rozpoczęto spójne odświeżenie desktopowego wyglądu aplikacji; moduły `SMS` i `Urządzenia` dostały wspólny shell wizualny z mocniejszym nagłówkiem, kartami hero, czytelniejszymi sekcjami danych oraz spokojniejszym układem kart, filtrów i tabel.
- SMS/admin: kafelki `Klienci na liście` i `Wysłane w tym miesiącu` mają teraz pełniejsze karty na desktopie, panel pokazuje aktywny widok już w nagłówku, a po ręcznej wysyłce automatycznie przełącza się na historię `Wysłane w tym miesiącu` zamiast zostawiać administratora na starej kolejce.
- urządzenia/admin: moduł `Urządzenia` pokazuje teraz rozszerzone statystyki (`Wymagają serwisu`, `Zdemontowane`), uporządkowaną sekcję filtrów z liczbą wyników i szybkim czyszczeniem oraz badge źródła danych przy każdym urządzeniu, żeby desktopowy widok był czytelniejszy bez ruszania mobilki.
- smoke/release: dodano `npm run test:smoke:desktop-refresh`, dopięto go do release x2, README i weryfikacji dokumentacji, żeby kolejne poprawki nie rozjechały nowego desktopowego stylu `SMS` i `Urządzenia`.

## 7.34
- SMS/admin: oba kafelki podsumowania w module SMS działają teraz jak przełącznik widoku; kliknięcie `Klienci na liście` pokazuje tabelę kolejki do obsługi, a kliknięcie `Wysłane w tym miesiącu` przełącza panel na listę bieżących wysyłek z danego miesiąca.
- SMS/ui: uproszczono logikę nagłówka modułu, zastępując poprzedni jednorazowy toggle `Wysłane w tym miesiącu` wspólnym stanem `activeSummaryView`, dzięki czemu aktywny kafelek jest zawsze jednoznaczny.
- smoke/release: rozszerzono `npm run test:smoke:sms-summary`, żeby oprócz logiki liczb pilnował też przełączania między widokiem kolejki i widokiem wysłanych SMS-ów po kliknięciu kafelków.

## 7.33
- SMS/admin: z górnego podsumowania modułu SMS usunięto kafelek `Do przypomnienia dziś`, bo w bieżącej pracy na liście przypomnień administrator potrzebuje tylko skrótów `Klienci na liście` i `Wysłane w tym miesiącu`.
- SMS/ui: siatka podsumowania została zwężona do dwóch kart, dzięki czemu nagłówek modułu SMS jest prostszy i nie pokazuje już zbędnej statystyki.
- smoke/release: zaktualizowano `npm run test:smoke:sms-summary`, żeby nadal sprawdzał logikę `getSmsSummary()`, ale w UI wymagał już tylko dwóch kart i pilnował braku tekstu `Do przypomnienia dziś`.

## 7.32
- smoke/release: dodano `npm run test:smoke:regex-compat`, który pilnuje, żeby krytyczne regexy smoke pozostały odporne na pojedyncze i podwójne cudzysłowy w kodzie źródłowym
- smoke/auth-refresh: uodporniono główny smoke na oba style cudzysłowów przy `document.addEventListener("visibilitychange")` i `searchParams.get("jobId")`, żeby release nie zatrzymywał się już na samym formacie stringów
- release/dokumentacja: zaktualizowano `README.md`, checklistę release i skrypt `npm run release`, tak aby nowy smoke był uruchamiany dwa razy razem z pozostałą walidacją

## 7.31
- montaże/kontrahenci: zapis montażu w koncie administratora próbuje teraz automatycznie podpiąć `contractor_id` do istniejącego kontrahenta, jeśli znajdzie bezpieczne dopasowanie po nazwie klienta oraz danych kontaktowo-adresowych; dzięki temu synchronizacja do `Urządzeń` dostaje poprawne powiązanie już przy zapisie montażu.
- formularz montażu: przy wysyłce formularza administratora system korzysta z tego samego auto-linkowania, więc nie blokuje zapisu tam, gdzie istnieje jednoznaczny kontrahent do podpięcia; dane kontaktowe i adresowe są uzupełniane z kontrahenta tylko wtedy, gdy pola w montażu są puste.
- smoke/release: dodano test `npm run test:smoke:job-contractor-link`, dopięto go do checklisty release x2 oraz do weryfikacji README, żeby automatyczne wiązanie montażu z `Kontrahenci` nie rozjechało się w kolejnych wersjach.

## 7.30
- urządzenia/admin: lista z `tabeli devices` uzupełnia teraz brakującą nazwę klienta, miasto, ulicę, telefon i e-mail fallbackiem z powiązanego rekordu `Montaże` po `source_job_id`, więc zsynchronizowane urządzenie bez przypiętego kontrahenta nie wpada już na widok `Bez klienta / Brak miasta / Brak kontaktu`
- smoke/release: dodano test `npm run test:smoke:device-client-fallback`, który pilnuje fallbacku danych klienta w module `Urządzenia` dla konta administratora i został dopięty do checklisty release x2

## 7.29
- smoke/release: dodano prawdziwy test `npm run test:smoke:sms-summary`, który sprawdza logikę `getSmsSummary()` oraz trzy karty podsumowania modułu SMS dostępne tylko w panelu administratora: `Klienci na liście`, `Do przypomnienia dziś`, `Wysłane w tym miesiącu`.
- build/release: dodano skrypt `npm run prepare:deps`, a `dev`, `build` i `preview` uruchamiają teraz przed Vite kontrolę czystej instalacji `npm ci --include=optional`, żeby release nie polegał na przypadkowo dołączonym `node_modules` i domykał brakujące natywne paczki Rollupa i esbuild z `package-lock.json`.
- wersjonowanie/release: `version:bump` i `verify:release` pilnują już także zgodności wersji w `package-lock.json`, a `README.md` oraz checklista release zostały rozszerzone o nowy smoke i stabilną instalację zależności.

## 7.28
- SMS/backend: funkcje SQL/RPC urządzeń (`admin_list_devices_with_contractor`) zwracają teraz `contractor_street`, więc podgląd klienta w module SMS pokazuje ulicę kontrahenta także dla źródła `Urządzenie`.
- urządzenia/SQL: ujednolicono etapy modułu urządzeń (`devices-module-stage-1..4`), żeby mapowały `coalesce(c.street, '') as contractor_street` razem z pozostałymi danymi kontrahenta.
- smoke/release: dodano test `npm run test:smoke:sms-street-sql`, który pilnuje obecności `contractor_street` w SQL/RPC urządzeń, a `npm run release` wykonuje go podwójnie.

## 7.27
- SMS/admin: poprawiono ulicę w podglądzie klienta dla źródła `Urządzenie`; moduł bierze ją teraz najpierw z `device.contractor_street`, a dopiero awaryjnie z `linkedJob.street`.
- urządzenia/fetch: do normalizacji i fallbacków dodano pole `contractor_street`, żeby dane kontrahenta mogły przejść do modułu SMS i innych widoków bez gubienia ulicy.
- smoke/release: dodano test `npm run test:smoke:sms-street`, który pilnuje priorytetu ulicy `contractor_street -> linkedJob.street` w danych modułu SMS.

## 7.26
- SMS/admin: w podglądzie klienta dodano przyciski `Przejdź do montażu` i `Przejdź do kontrahenta`, więc z kolejki SMS można od razu wejść w pełne dane powiązanego montażu albo kontrahenta.
- kontrahenci/nawigacja: moduł `Kontrahenci` potrafi otworzyć wskazanego kontrahenta po wejściu z modułu SMS, razem z otwarciem szczegółów.
- smoke/release: dodano test `npm run test:smoke:sms-navigation`, który pilnuje przejść z podglądu klienta SMS do modułów `Montaże` i `Kontrahenci`.

## 7.25
- SMS/admin: usunięto kolumnę `Status` z listy klientów do wysyłki, żeby kolejka była prostsza i bardziej robocza.
- SMS/admin: klient na liście jest teraz klikalny; po kliknięciu otwiera się osobna tabela `Dane klienta` z telefonem, e-mailem, adresem, modelem urządzenia, numerem seryjnym i terminem przeglądu.
- smoke/release: dodano test `npm run test:smoke:sms-client-details`, który pilnuje braku kolumny statusu oraz obecności klikalnego podglądu klienta w module SMS.

## 7.24
- usunięto pusty plik `npx` z projektu, żeby nie wpadał już przypadkowo do paczki release
- `scripts/release-zip.cjs` wyklucza teraz dodatkowo plik `npx`, więc nawet przy jego przypadkowym odtworzeniu nie trafi do ZIP-a
- `scripts/verify-release.cjs` sprawdza teraz również, że release ZIP nie zawiera pustego pliku `npx`
- `README.md` i checklist release zostały uzupełnione o kontrolę, że paczka nie zawiera `npx`

## 7.23
- smoke/release: dodano twardszą kontrolę jakości release przez osobne testy `npm run test:smoke:version`, `npm run test:smoke:delete` i `npm run test:smoke:device-save`, a także czytelny alias `npm run test:smoke:admin-worker` dla ścieżki ról administrator kontra pracownik
- smoke/version: nowy test pilnuje zgodności wersji między `app-version.json`, `package.json`, `src/version.js` oraz widocznej wersji na ekranie logowania i w widokach `MobileJobsLayout` / `DesktopJobsLayout`
- smoke/jobs: nowy test usuwania montażu sprawdza potwierdzenie `Usuń na stałe`, wywołanie `confirmDeleteJobRecord` i samo kasowanie rekordu `jobs` razem z usuwaniem ścieżek zdjęć
- smoke/device-save: nowy test zapisu edycji montażu pilnuje pól `device_model` i `device_serial_number` w formularzu oraz payloadu aktualizacji `jobs`
- dokumentacja/release: zaktualizowano `README.md` i skrypt `npm run release`, żeby nowa checklista jakości była obowiązkową częścią każdej wersji

## 7.22
- baza/diagnostyka: dodano plik `db-health-check-details.sql`, który obok statusów `OK/CHECK` pokazuje też gotowe komendy naprawcze (`suggested_fix`) dla kontroli `devices.source_job_id`, `devices.contractor_id` i `photo_audit_log.job_id`
- verify/readme: rozszerzono `README.md` o opis szczegółowej diagnostyki oraz `verify:release`, żeby pilnował obecności pliku `db-health-check-details.sql` i tej sekcji dokumentacji

## 7.21
- baza/diagnostyka: dodano plik `db-health-check.sql`, który wykonuje wyłącznie odczytowe kontrole stanu produkcyjnej bazy po migracjach dla `devices.source_job_id`, `devices.contractor_id` i `photo_audit_log.job_id`
- verify/readme: rozszerzono `README.md` o sekcję diagnostyki bez zmian oraz `verify:release`, żeby pilnował obecności pliku `db-health-check.sql` i tej sekcji dokumentacji

## 7.20
- baza/naprawa: dodano zbiorczy plik `db-repair-production-post-migrations.sql`, który naprawia produkcyjne niespójności dla `devices.source_job_id`, `devices.contractor_id` i `photo_audit_log.job_id`
- dokumentacja/readme: dodano sekcję `Naprawa produkcyjnej bazy po migracjach` z krótką instrukcją kiedy uruchamiać pakiet naprawczy i co dokładnie koryguje

## 7.19
- smoke/selection: dodano test `npm run test:smoke:selection`, który pilnuje ścieżki wyboru montażu w widokach mobile i desktop oraz renderowania `JobDetailsPanel` po ustawieniu `selectedJob`
- wydajność/job-form: `JobFormModal` jest teraz ładowany lazy dopiero przy dodawaniu lub edycji montażu, więc cięższy formularz nie siedzi już w kodzie startowym aplikacji
- suspense/form: dodano fallback `Trwa ładowanie formularza montażu...` i rozszerzono smoke fallbacków `Suspense` o formularz montażu
- release/zip: paczka `klima-app-v7.19.zip` wyklucza teraz także `README-START.txt`, a `verify:release --require-zip` sprawdza, że ten plik nie wraca do release ZIP

## 7.18
- smoke/suspense: dodano test `npm run test:smoke:suspense`, który pilnuje fallbacków `Suspense` dla modułów administratora, widoków `Montaże` i lazy loadingu `JobDetailsPanel`
- wydajność/job-details: `JobDetailsPanel` jest teraz ładowany lazy dopiero po wybraniu montażu, zamiast dokładać panel szczegółów do początkowego chunku aplikacji
- wydajność/export: eksporty modułu `Montaże` rozbito na osobne pliki dynamiczne dla Excel i PDF (`jobs-export-excel.js`, `jobs-export-pdf.js`), a wspólne helpery przeniesiono do `jobs-export-shared.js`
- release/zip: paczka `klima-app-v7.18.zip` wyklucza teraz także robocze pliki `README-SMS-STAGE-*`, a `verify:release --require-zip` sprawdza, że nie wracają do release ZIP

## 7.17
- smoke/lazy: dodano test `npm run test:smoke:lazy`, który pilnuje lazy loadingu modułów administratora, widoków `JobsPanel`, przełączania modułów i dynamicznego ładowania importu/eksportu XLSX
- release/zip: paczka `klima-app-v7.17.zip` wyklucza teraz katalog roboczy `supabase/.temp`, a `verify:release --require-zip` dodatkowo sprawdza, że ten katalog nie wraca do ZIP
- wydajność/jobs: `JobsPanel` ładuje teraz lazy widoki `MobileJobsLayout` i `DesktopJobsLayout`, więc start aplikacji nie pobiera od razu obu layoutów montaży
- wydajność/xlsx: moduły `Kontrahenci` i `Urządzenia` dociągają parsery/importery XLSX dopiero przy akcji użytkownika, zamiast dokładać je do początkowego chunku panelu

## 7.16
- dokumentacja/release: uporządkowano `README.md`, zostawiając jedną spójną instrukcję projektu, wersjonowania i checklisty wydania
- wydajność/app-shell: moduły administratora `SMS`, `Kontrahenci` i `Urządzenia` są ładowane lazy loadingiem, więc nie obciążają głównego bundla startowego przy wejściu do `Montaże`
- smoke/role: dodano osobny test `npm run test:smoke:roles`, który pilnuje guardów `pracownik/admin`, widoczności modułów i blokad RPC dla paneli administratora
- release: skrypt `npm run release` wykonuje teraz także smoke test ról dwa razy, razem z dotychczasowym smoke, verify, build i paczką ZIP

## 7.15
- SMS/widok: usunięto z górnej części modułu `SMS` blok `Podgląd wiadomości`, żeby ekran był prostszy i bardziej roboczy
- SMS/widok: pod tytułem `Lista klientów do wysyłki SMS` usunięto zbędny opis, zostawiając sam nagłówek listy

## 7.14
- urządzenia/widok: usunięto z górnego podsumowania modułu `Urządzenia` liczniki `Do serwisu` i `Zdemontowane`, żeby na górze nie wyświetlały się już te badge'e
- urządzenia/widok: w sekcji podsumowania zostawiono tylko `Wszystkie urządzenia` i `Aktywne`; nie zmieniano logiki statusów ani filtrowania tabeli

## 7.13
- SMS/kolejka: po skutecznej wysyłce klient znika od razu z listy `Klienci do wysyłki SMS`, a pozycje ze statusem `wysłano`, `doręczono`, `usunięto` i `niewysłano` nie są już renderowane w kolejce roboczej
- SMS/backend: ręczna wysyłka aktualizuje istniejący wpis `pending_approval` dla tego samego cyklu zamiast zostawiać stary log na liście, więc bieżący cykl trafia wyłącznie do historii

## 7.11
- urządzenia/tabela: usunięto techniczne dopiski typu `Urządzenie ręczne` i podobne etykiety spod modelu w kolumnie `Urządzenie`
- urządzenia/tabela: pod nazwą urządzenia pokazujemy już tylko sensowną notatkę urządzenia; jeśli to tylko techniczny znacznik źródła, nie pokazujemy go wcale

## 7.10
- baza/urządzenia: dodano zbiorczy plik `db-repair-devices.sql`, który w jednym kroku usuwa konfliktujące przeciążenia `admin_upsert_device`, odbudowuje funkcje synchronizacji urządzeń z modułem `Montaże` i odtwarza trigger `jobs_sync_device_after_change`
- baza/urządzenia: plik wykrywa rzeczywisty typ `public.devices.source_job_id` (`uuid` albo `text`) i buduje właściwe funkcje bez psucia działającego klucza obcego do `jobs.id`

## 7.09 - 2026-04-17

- hotfix SQL dla `admin_upsert_device`: ujednolicenie `public.devices.source_job_id` do typu `text`
- usunięcie starych przeciążeń `admin_upsert_device`, które powodowały konflikt i błędy zapisu numeru seryjnego
- odtworzenie funkcji synchronizacji urządzeń z montaży w wariancie zgodnym z `source_job_id` jako `text`
- poprawka dla błędu `column "source_job_id" is of type uuid but expression is of type text`

## 7.08
- baza/hotfix: dodano plik `devices-module-stage-4-admin-upsert-hotfix.sql`, który usuwa stare przeciążenia `admin_upsert_device` i tworzy jedną poprawną funkcję zgodną z realnym typem `public.devices.source_job_id`
- urządzenia/edycja: naprawiono zapis zmian urządzenia po błędach `Could not choose the best candidate function` oraz `column "source_job_id" is of type uuid but expression is of type text`

## 7.07
- SMS: po ręcznym wysłaniu klient znika z listy bieżącego cyklu, bo zapisujemy poprawny `reminder_cycle` i `reminder_due_date`.
- SMS: licznik `Klienci na liście` jest klikalny i przewija do tabeli kolejki.

## 7.06
- spójność/moduły: zapis urządzenia powiązanego z montażem aktualizuje teraz w `jobs` nie tylko model, numer seryjny i datę montażu, ale też przypisanego kontrahenta oraz jego dane kontaktowe, więc `Montaże`, `Kontrahenci` i `Urządzenia` pokazują te same podstawowe dane klienta
- SMS/backend: akcja `Usuń` w kolejce SMS zapisuje już spójny status `deleted` także w powiązanym rekordzie `jobs`, więc historia i ostatni status SMS nie rozjeżdżają się między modułami
- SMS/backend: ręczna wysyłka SMS z poziomu urządzenia aktualizuje teraz również pola `last_sms_*` w powiązanym montażu, więc moduł `SMS` i dane źródłowe klienta pozostają zsynchronizowane
- SMS/queue: generator kolejki bierze pod uwagę ustawienia z powiązanego montażu (`sms_consent`, `sms_reminder_enabled`, `service_reminder_years`, numer telefonu), dzięki czemu przypomnienia z urządzeń respektują te same zasady co moduł `Montaże`

## 7.05
- urządzenia/edycja: zapis zmian dla urządzeń zsynchronizowanych z modułu `Montaże` aktualizuje teraz także rekord źródłowy w tabeli `jobs`, więc zmiana numeru seryjnego, modelu albo daty montażu od razu wraca na listę urządzeń
- urządzenia/sync: poprawiono zapis urządzeń typu `job`, żeby późniejsza synchronizacja z montaży nie nadpisywała ręcznie zapisanej edycji starymi danymi

## 7.04
- urządzenia/klient: w kolumnie `Klient` usunięto duplikat miasta przed adresem i końcową nazwę klienta w nawiasie, więc pokazujemy tylko potrzebny adres albo samo miasto
- urządzenia/klient: jeśli notatka wygląda jak adres, czyścimy ją z nadmiarowego prefiksu miasta i zbędnego dopisku w nawiasie

## 7.03
- urządzenia/tabela: jeśli notatka urządzenia wygląda jak adres klienta, pokazujemy ją pod kolumną `Klient` razem z miastem, zamiast pod kolumną `Urządzenie`
- urządzenia/tabela: pod kolumną `Urządzenie` zostaje teraz tylko opis samego sprzętu albo identyfikator montażu, więc układ listy jest czytelniejszy

## 7.02
- przywrócono działające usuwanie `Usuń` i `Usuń zaznaczone` w module SMS na bazie stabilnej logiki z `6.97`
- cofnięto regresję backendu `send-service-sms`, dzięki czemu usunięte pozycje naprawdę znikają z kolejki i zapisują się w historii
- uspokojono odświeżanie listy SMS: cichy reload po akcjach i ograniczenie odświeżania po focusie/zmianie karty

## 7.01
- SMS/admin: przywrócono na liście klientów do wysyłki przycisk `Usuń` w każdym wierszu oraz akcję `Usuń zaznaczone` nad tabelą.
- SMS/admin: usunięto zbędny przycisk `Podgląd` z kolejki, żeby w kolumnie `Akcja` zostały tylko potrzebne operacje `Usuń` i `Wyślij`.
- SMS/backend: funkcja `send-service-sms` ponownie obsługuje tryb `delete`, więc usunięcie z kolejki zapisuje status `deleted` w `sms_log` i od razu znika z listy.

## 7.00
- w module `Urządzenia` zmniejszono przyciski `Edytuj` i `Historia SMS`, ustawiono je jeden pod drugim oraz usunięto desktopowy select statusu z kolumny `Akcje`, żeby całość mieściła się po szerokości.

- urządzenia/tabela: skrócono nagłówek kolumny z `Status urządzenia` do `Status`, żeby odzyskać miejsce w wierszu tabeli
- urządzenia/akcje: przyciski `Edytuj` i `Historia SMS` ustawiono jeden pod drugim i zmniejszono ich rozmiar, dzięki czemu cała kolumna `Akcje` mieści się w widoku
- urządzenia/układ: zwężono kolumny `Klient`, `Urządzenie`, `Data montażu` i `Status`, żeby tabela lepiej mieściła się po szerokości na desktopie

## 6.91
- SMS/admin: kolejka przypomnień przestała opierać się wyłącznie na tabeli `jobs` i analizuje teraz także urządzenia z katalogu `devices`, więc zaimportowane klimatyzatory wracają na listę klientów do obsługi SMS
- urządzenia/admin: w module `Urządzenia` dodano podgląd historii SMS dla każdego urządzenia, z terminem cyklu, statusem i datą zapisanej akcji
- backend/Supabase: dodano plik `sms-module-stage-7-device-history.sql`, który rozszerza `sms_log` o `device_id`, `reminder_cycle` i `reminder_due_date` oraz aktualizuje snapshot modułu SMS dla nowej historii urządzeń
- edge functions: `generate-service-sms-queue` i `send-service-sms` obsługują teraz urządzenia z katalogu `devices`, więc administrator może wygenerować i wysłać SMS także dla sprzętu zaimportowanego spoza modułu montaży

## 6.90
- urządzenia/import XLSX: okno analizy importu ma teraz ograniczoną wysokość i własny scroll, więc długie podsumowania, duplikaty i błędne wiersze nie uciekają poza ekran
- urządzenia/import XLSX: sekcja akcji została przypięta do dołu modala, dzięki czemu przyciski `Importuj tylko nowe` i `Anuluj` są widoczne nawet przy dużej liczbie rekordów
- urządzenia/import XLSX: lista nowych urządzeń ma bardziej kompaktowy podgląd i czytelną notę, że na ekranie pokazujemy tylko pierwsze 12 pozycji, ale import obejmuje wszystkie zaakceptowane rekordy

## 6.89
- urządzenia: moduł `Urządzenia` dostał import XLSX z analizą pliku przed zapisem, więc administrator może masowo wczytać kontrahenta, model, numer seryjny, datę montażu, status i notatki urządzeń
- urządzenia: import XLSX wykrywa brakujących kontrahentów oraz duplikaty numerów seryjnych w bazie i w samym pliku, a do zapisu przepuszcza tylko nowe rekordy
- kontrahenci: w szczegółach kontrahenta lista urządzeń ma już przycisk `Edytuj urządzenie`, który pozwala poprawić model, numer seryjny, datę montażu, status i notatki bez wychodzenia z karty klienta
- urządzenia/fallback: gdy urządzenie pochodzi tylko z modułu `Montaże`, zapis z poziomu szczegółów kontrahenta aktualizuje pola urządzenia bezpośrednio w tabeli `jobs`, więc edycja działa także przed pełnym wdrożeniem osobnej tabeli `devices`
- smoke/release: rozszerzono test smoke o kontrolę importu XLSX urządzeń i ścieżki edycji urządzenia z modułu `Kontrahenci`

## 6.88
- urządzenia: moduł administratora został przebudowany z listy „z montaży” na prawdziwy katalog oparty o osobną tabelę `devices`, z bezpiecznym fallbackiem do danych z modułu `Montaże`, jeśli SQL nie został jeszcze wdrożony
- urządzenia: panel pokazuje teraz źródło danych (`tabela devices` lub fallback z montaży), filtr statusu i pozwala zmieniać własny status urządzenia: `aktywne`, `do_serwisu`, `zdemontowane`
- kontrahenci: szczegóły kontrahenta próbują czytać urządzenia z nowego RPC `admin_get_contractor_devices`, a gdy backend nie jest jeszcze gotowy, wracają do danych zapisanych przy montażach
- baza: dodano plik `devices-module-stage-3-sync.sql`, który tworzy tabelę `devices`, RPC (`admin_list_devices_with_contractor`, `admin_get_contractor_devices`, `admin_upsert_device`, `admin_update_device_status`, `admin_sync_devices_from_jobs`) oraz trigger synchronizujący urządzenia z tabelą `jobs`
- smoke/release: test smoke sprawdza teraz także obecność nowego SQL modułu urządzeń i kluczowych elementów prawdziwego katalogu urządzeń

## 6.87
- urządzenia/admin: przywrócono realny moduł `Urządzenia` w przełączniku administratora i dopięto go do `App.jsx`, więc zakładka znów jest widoczna obok `Montaże`, `Kontrahenci` i `SMS`
- urządzenia/admin: dodano panel `Urządzenia` oparty na danych z montaży, z wyszukiwaniem po kliencie, modelu, numerze seryjnym, telefonie, mieście i dacie montażu
- urządzenia/admin: lista pokazuje nazwę klienta, model urządzenia, numer seryjny, datę montażu oraz status montażu, a na mobile przełącza się na czytelne karty
- smoke/release: rozszerzono smoke test o kontrolę obecności modułu `Urządzenia` w nawigacji i renderowaniu aplikacji

## 6.86
- montaże: formularz `Nowy montaż / zlecenie` dostał pola `Model urządzenia` i `Numer seryjny`, więc dane sprzętu można zapisać od razu przy dodawaniu lub edycji montażu
- montaże: szczegóły karty pokazują teraz zapisany model urządzenia i numer seryjny obok daty montażu
- kontrahenci: szczegóły kontrahenta pokazują sekcję `Urządzenia z montaży`, która zbiera model i numer seryjny z wszystkich powiązanych montaży klienta
- wyszukiwanie: wyszukiwarka modułu `Montaże` obejmuje teraz także model urządzenia i numer seryjny
- baza: dodano plik `jobs-device-fields-stage-1.sql` z migracją kolumn `jobs.device_model` i `jobs.device_serial_number`

## 6.85
- kontrahenci: dodano przycisk `Export XLSX`, który eksportuje pełną listę kontrahentów do pliku Excel bez opuszczania modułu administratora
- kontrahenci: eksport obejmuje nazwę, osobę kontaktową, telefon, email, miasto, ulicę, NIP, notatki i status aktywności

## 6.84
- kontrahenci: poprawiono pobieranie listy administratora tak, aby moduł ładował wszystkie rekordy także po przekroczeniu limitu 1000 wpisów, zamiast ucinać listę na pierwszej stronie wyników
- kontrahenci: dzięki paginowanemu odczytowi wyszukiwarka i lista `Wszyscy kontrahenci` obejmują teraz również dalsze rekordy, takie jak wcześniej niewidoczni kontrahenci spoza pierwszego tysiąca

## 6.81
- poprawiono odświeżanie i synchronizację zmiany nazwy kontrahenta z montażami po zapisie edycji, żeby po przejściu do modułu `Montaże` nie zostawała stara nazwa typu `NN`
- rozszerzono dopasowanie starych montaży bez `contractor_id`, używając także aktualnych danych kontrahenta i bezpiecznego fallbacku dla pojedynczego dopasowania po starej nazwie
- skrócono etykietę `Moduł SMS` do `SMS` w przełączniku modułów i dopasowano styl mobilny, żeby przyciski mieściły się w jednej linii

## 6.80
- kontrahenci: na mobile tabela została zastąpiona czytelnymi kartami z nazwą, adresem, telefonem, emailem, NIP i akcjami
- kontrahenci: zapis edycji synchronizuje teraz powiązane montaże, żeby zmieniona nazwa klienta była widoczna także w kartach zleceń
- kontrahenci: dla starszych montaży bez `contractor_id` synchronizacja próbuje dopiąć rekordy po starej nazwie i zgodnych danych kontaktowych

## 6.79
- kontrahenci: zwężono kolumnę `Email`, poszerzono kolumnę `Nazwa + adres` i odzyskano miejsce w tabeli dla czytelniejszego widoku
- kontrahenci: zmniejszono przyciski `Edytuj` i `Usuń` w kolumnie `Akcje`, żeby lepiej mieściły się przy większej liczbie rekordów

## 6.78
- usunięto z widoku administratora licznik „Klienci do przypomnienia dziś”.
- usunięto opis pod nagłówkiem modułu kontrahentów.
- przesunięto akcje modułu kontrahentów do lewego układu.
- dopracowano profesjonalny wygląd i przewijanie tabeli kontrahentów.

## 6.77
- usunięto logikę podobnej nazwy z formularza i importu XLSX kontrahentów
- duplikaty kontrahentów są wykrywane tylko po nazwie 1:1, telefonie, emailu i NIP

## 6.76
- moduł `Kontrahenci`: import z pliku XLSX został przebudowany na dwuetapowy proces — najpierw analiza pliku, potem świadomy import tylko nowych rekordów
- import pokazuje osobno: nowe rekordy do importu, duplikaty i wiersze błędne
- duplikaty przy imporcie są wykrywane po nazwie, telefonie, emailu i NIP; miasto i ulica nie biorą udziału w logice duplikatów
- podobne nazwy trafiają do sekcji `Do sprawdzenia`, a twarde duplikaty są pomijane
- przy duplikatach z pliku można od razu otworzyć istniejącego kontrahenta z bazy
- komunikat po imporcie podaje liczbę dodanych rekordów, duplikatów i błędnych wierszy

## 6.75
- kontrahenci: przy trafieniach duplikatów w formularzu `Nowy kontrahent` dodano drugi przycisk `Edytuj istniejącego kontrahenta`, więc administrator może od razu przejść do poprawy istniejącego wpisu
- kontrahenci: opis powodów dopasowania skrócono do formy `Duplikat po: nazwa / telefon / email / NIP`, dzięki czemu lista podobnych wpisów jest czytelniejsza i szybsza w użyciu

## 6.74
- kontrahenci: komunikat o duplikacie w formularzu pokazuje teraz przycisk `Otwórz istniejącego kontrahenta`, który otwiera szczegóły właściwego wpisu bez ręcznego wyszukiwania

## 6.73
- dodano plik `contractors-module-stage-10-contact-duplicate-guards.sql`, który domyka backendowe guardy duplikatów kontrahentów także po `email`, `phone` i `nip`, bez polegania wyłącznie na walidacji w UI
- trigger Supabase zwraca teraz czytelne błędy przy próbie zapisu kontrahenta o tym samym emailu, telefonie lub NIP, więc administrator od razu wie, które pole powoduje konflikt

## 6.72
- kontrahenci/admin: formularz `Nowy kontrahent` wykrywa potencjalne duplikaty już podczas wpisywania po nazwie, telefonie, emailu, ulicy i NIP, dzięki czemu administrator szybciej widzi, że podobny wpis już istnieje
- kontrahenci/admin: przy wykryciu duplikatu pojawia się lista do 3 istniejących kontrahentów z powodami dopasowania i szybkim wejściem do szczegółów, a przycisk `Zapisz kontrahenta` pozostaje zablokowany do czasu poprawy danych
- smoke/release: rozszerzono smoke test o helper duplikatów kontrahentów i zaktualizowano dokumentację do wersji 6.72

## 6.71
- montaże: usunięto osobne pola `Wyszukaj kontrahenta w bazie` i `Baza kontrahentów`; wybór klienta działa teraz bezpośrednio w polu `Klient`, które pokazuje do 3 podpowiedzi istniejących kontrahentów podczas wpisywania
- montaże: kliknięcie podpowiedzi kontrahenta nadal uzupełnia dane klienta i zapisuje `contractor_id`, a ostrzeżenie o duplikacie prowadzi teraz do wyboru z podpowiedzi zamiast z osobnej listy
- modale: potwierdzenie `Zamknąć bez zapisu?` zamyka się już poprawnie po kliknięciu `Zamknij bez zapisu`, więc nie zostaje na ekranie po zamknięciu formularza
- smoke/release: zaktualizowano smoke test pod uproszczony wybór kontrahenta i domknięcie modala potwierdzenia; dokumentację podniesiono do wersji 6.71

## 6.70
- montaże: formularz `Wybierz kontrahenta z bazy` dostał osobne pole wyszukiwania po nazwie, NIP, telefonie i ulicy, więc znalezienie właściwego klienta nie wymaga już przewijania całej listy
- montaże: po wyborze kontrahenta z bazy nadal uzupełniają się dane klienta, a po ręcznej zmianie nazwy wybranego kontrahenta formularz czyści powiązanie `contractor_id`, żeby nie zostawić błędnego połączenia z innym wpisem
- montaże: ręczne wpisanie klienta, który już istnieje w bazie kontrahentów, pokazuje ostrzeżenie i blokuje zapis z komunikatem `wybierz z bazy`, co ogranicza dublowanie klientów
- smoke/release: rozszerzono smoke test o wyszukiwanie kontrahentów po wielu polach i wykrywanie duplikatu nazwy klienta; dokumentację podniesiono do wersji 6.70

## 6.69
- kontrahenci/admin: tabela `Wszyscy kontrahenci` usuwa kolumnę `Osoba kontaktowa`, a odzyskane miejsce przeznacza na szerszy `Email` i bardziej widoczne akcje `Edytuj` / `Usuń`
- kontrahenci/admin: pod formularzem `Nowy kontrahent` usunięto dodatkowy podgląd danych firmy po zapisie, więc po dodaniu wpisu nie pojawia się już niepotrzebny dolny blok
- UI/release: zwężono minimalną szerokość tabeli i dopasowano szerokości kolumn kontrahentów do nowego układu, a dokumentację podniesiono do wersji 6.69

## 6.68
- kontrahenci/admin: pierwsza kolumna tabeli znów pokazuje `Nazwę` oraz adres (`Ulica` i `Miasto`) w jednym miejscu, więc lista wygląda czytelniej i przypomina sprawdzony wcześniejszy układ
- kontrahenci/admin: usunięto osobne kolumny `Miasto` i `Ulica`, a odzyskane miejsce przeznaczono na lepszą widoczność akcji `Edytuj` i `Usuń` bez obcinania tabeli
- kontrahenci/admin: kliknięcie nazwy nadal otwiera szczegóły w osobnym oknie, ale modal ma teraz uporządkowany, dwukolumnowy układ pól i osobną sekcję notatek zamiast rozjechanego widoku
- UI/release: dokumentacja została podniesiona do wersji 6.68; po zmianie układu kontrahentów nadal obowiązuje podwójne smoke, verify, build i ZIP release

## 6.67
- kontrahenci/admin: tabela `Wszyscy kontrahenci` pokazuje teraz komplet pól zgodnych z formularzem `Nowy kontrahent` — `Nazwa`, `Osoba kontaktowa`, `Telefon`, `Email`, `Miasto`, `Ulica` i `NIP` — dzięki czemu lista odpowiada rzeczywistym danym wpisu
- kontrahenci/admin: zwężono układ tabeli i szerokości kolumn, szczególnie dla `Telefonu` i `NIP`, więc widok mieści więcej danych bez niepotrzebnego marnowania miejsca
- kontrahenci/admin: kliknięcie nazwy kontrahenta na liście otwiera teraz osobne okno ze szczegółami i akcjami `Edytuj` / `Usuń`, zamiast rozwijać dane pod tabelą
- UI/release: dokumentacja została uzupełniona do wersji 6.67, a smoke/build/verify dalej pilnują spójności wydania po tej przebudowie widoku kontrahentów

## 6.66
- kontrahenci/admin: dodano kolumnę `NIP` do tabeli, formularza i podglądu kontrahenta, więc dane firmowe można teraz przechowywać bez osobnych notatek
- kontrahenci/admin: tabela kontrahentów ma sortowanie po kliknięciu w nagłówki oraz szybkie akcje `Edytuj` i `Usuń` w każdym wierszu, co przy większej bazie daje szybszą i stabilniejszą obsługę
- kontrahenci/admin: dodano import z pliku `XLSX` bezpośrednio w module, z pomijaniem pustych i zdublowanych wierszy podczas zapisu do bazy
- montaże/admin: formularz nowego i edytowanego zlecenia pozwala wybrać kontrahenta z gotowej bazy, automatycznie uzupełnia podstawowe pola kontaktowe i zapisuje powiązanie przez `jobs.contractor_id`
- Supabase/release: dodano plik `contractors-module-stage-8.sql` z kolumną `nip`, poprawionym RPC `admin_upsert_contractor` oraz kolumną `jobs.contractor_id`; smoke test pilnuje teraz także importu XLSX, pola `contractor_id` i nowego SQL-a

## 6.65
- kontrahenci/admin: przyciski `Wszyscy kontrahenci` i `Nowy kontrahent` działają teraz jak rozłączne przełączniki sekcji — jedno kliknięcie otwiera, drugie zamyka, a w danym momencie widoczna jest tylko jedna sekcja
- kontrahenci/admin: po wejściu do modułu nadal nic nie otwiera się automatycznie, ale teraz przycisk `Wszyscy kontrahenci` potrafi też zwinąć listę po ponownym kliknięciu
- kontrahenci/admin: przycisk `Nowy kontrahent` otwiera sam formularz nowego wpisu bez równoległego rozwijania listy kontrahentów, więc dodawanie odbywa się w osobnym, czystym widoku
- kontrahenci/admin: kliknięcie rekordu z tabeli przełącza moduł w tryb edycji wybranego kontrahenta, a zamknięcie formularza wraca do pustego widoku startowego

## 6.64
- kontrahenci/admin: po wejściu do modułu nic nie otwiera się już automatycznie; zamiast tego widać tylko dwa przyciski sterujące i krótki komunikat, co można zrobić dalej
- kontrahenci/admin: przycisk `Wszyscy kontrahenci` otwiera samą listę kontrahentów, czyści zaznaczenie i zamyka formularz, więc widok listy działa teraz dokładnie jak osobna sekcja
- kontrahenci/admin: przycisk `Nowy kontrahent` otwiera formularz dopiero na żądanie i pokazuje go pod tabelą, a kliknięcie w rekord z tabeli nadal otwiera edycję wybranego wpisu pod spodem
- UI: dodano czytelniejszy stan aktywnego przycisku, żeby od razu było widać, czy otwarta jest lista czy formularz

## 6.63
- kontrahenci/admin: przebudowano górny obszar modułu na dwa przyciski `Wszyscy kontrahenci` i `Nowy kontrahent`, więc lista i tworzenie nowego wpisu są teraz rozdzielone i bardziej czytelne
- kontrahenci/admin: formularz kontrahenta nie jest stale widoczny obok tabeli; otwiera się dopiero po kliknięciu `Nowy kontrahent` albo wybraniu rekordu do edycji i wyświetla się pod listą
- kontrahenci/admin: przycisk `Wszyscy kontrahenci` czyści filtr, zamyka formularz i wraca do samej listy, dzięki czemu widok startowy jest prostszy i czystszy
- release: zaktualizowano dokumentację do wersji 6.63 i utrzymano brak dodatkowych zmian SQL dla tej wersji UI

## 6.62
- kontrahenci/admin: usunięto małą listę po lewej stronie i przebudowano moduł na pełną tabelę z kolumnami w głównym obszarze, dzięki czemu większa baza kontrahentów jest czytelniejsza i wygodniejsza w obsłudze
- kontrahenci/admin: w górnym panelu pozostaje tylko kafel-przycisk `Wszyscy kontrahenci`, który czyści filtr wyszukiwania i pokazuje pełną listę; licznik `Aktywni` został usunięty
- kontrahenci/admin: usunięto przycisk jednorazowego importu startowego z obecnych klientów, bo import został już wykonany
- smoke/release: test smoke pilnuje teraz widoku tabeli kontrahentów i braku licznika `Aktywni`, a dokumentacja została zaktualizowana do wersji 6.62

## 6.61
- administrator: dodano osobny moduł `Kontrahenci` z własnym przyciskiem w przełączniku modułów, osobną listą wpisów oraz panelem dodawania, edycji i usuwania danych kontrahentów
- kontrahenci: nowy panel ma wyszukiwarkę, formularz danych kontaktowych, status aktywności oraz podgląd najważniejszych informacji, dzięki czemu baza kontrahentów jest odseparowana od modułu montaży
- Supabase: dodano plik `contractors-module-stage-7.sql` z tabelą `contractors`, triggerem `updated_at`, politykami RLS i RPC `admin_list_contractors`, `admin_upsert_contractor`, `admin_delete_contractor` tylko dla administratora
- smoke/release: `npm run test:smoke` sprawdza też guardy i RPC modułu Kontrahenci, a dokumentacja projektu została uzupełniona o nowy moduł i wymagany plik SQL do wdrożenia

## 6.60
- moduł SMS: odczyt ustawień i historii oraz zapis ustawień administratora przechodzą teraz przez RPC `admin_get_sms_module_snapshot` i `admin_upsert_sms_settings`, więc krytyczne operacje SMS są domknięte po stronie Supabase, a nie tylko w UI
- moduł SMS: pracownik nie odpytuje już danych ustawień ani logów SMS, a główny widok aplikacji ma dodatkowy bezpiecznik, który nie renderuje panelu SMS poza kontem administratora
- release: `version:bump` automatycznie dopisuje nową wersję do `README.md` i `CHANGELOG.md`, a `verify:release` sprawdza brak placeholderów oraz testuje, czy kolejna wersja też zostanie dopisana automatycznie
- smoke/Supabase: rozszerzono `npm run test:smoke` o kontrolę guardów admin/pracownik dla SMS i dodano plik `sms-module-stage-6-admin-guards.sql` z dodatkowymi politykami, RPC i triggerem blokującym zmianę technicznych pól statusu SMS poza administratorem

## 6.59
- formularz montażu: nowe zlecenie ma teraz domyślnie włączone checkboxy `Zgoda na SMS` i `Aktywne przypomnienia`, więc standardowy przypadek jest od razu zaznaczony
- widok pracownika: ukryto licznik `Klienci do przypomnienia dziś`, więc na ekranie ogólnym nie ma już żadnych elementów związanych z modułem SMS

## 6.57
- karta klienta: usunięto sekcję `Moduł SMS i serwis`, więc po otwarciu szczegółów montażu nie widać już technicznych informacji o przypomnieniach i ostatnim statusie SMS
- uprawnienia: pracownik nie widzi już przycisku `Moduł SMS` w przełączniku modułów i aplikacja pilnuje, żeby widok SMS był dostępny tylko dla administratora

## 6.56
- formularz montażu: połączono `Telefon klienta` i `Telefon do SMS` w jedno pole `Telefon klienta / SMS`, żeby użytkownik wpisywał tylko jeden numer
- formularz montażu: zapis i edycja kopiują teraz ten sam numer jednocześnie do kontaktu klienta i numeru używanego przez moduł SMS
- formularz montażu: `Zgoda na SMS` i `Aktywne przypomnienia` są w jednej linii, mają krótsze opisy i mniejszy tekst, więc sekcja wygląda czyściej i zajmuje mniej miejsca

## 6.55
- moduł SMS: historia wysyłek ma teraz ciaśniejsze odstępy pionowe, więc więcej wpisów mieści się na ekranie bez wrażenia nadmiernej wysokości panelu
- moduł SMS: zmniejszono teksty w historii wysyłek, żeby komunikaty i dane kontaktowe były bardziej kompaktowe
- moduł SMS: skrócono i odchudzono badge statusu w historii, dzięki czemu cały panel wygląda czyściej i bardziej profesjonalnie

## 6.54
- moduł SMS: przywrócono wąską pierwszą kolumnę z checkboxem na początku tabeli, tak żeby zajmowała tylko szerokość samego checkboxa
- moduł SMS: zmniejszono przyciski `Podgląd` i `Wyślij`, dzięki czemu mieszczą się w jednej linii i nie są już obcinane
- moduł SMS: badge statusu i przyciski akcji mają teraz bliższe proporcje wysokości, więc wiersz tabeli wygląda czyściej i bardziej spójnie

## 6.53
- moduł SMS: kolumna checkboxa w głównej tabeli została zwężona do szerokości samego checkboxa, więc nie marnuje już miejsca w wierszu
- moduł SMS: kolumna akcji ma teraz stały układ dwóch równych przycisków `Podgląd` i `Wyślij`, które mieszczą się obok siebie w jednej linii
- moduł SMS: dodano modal podglądu klienta przed wysyłką z numerem telefonu, terminem przeglądu, datą montażu i treścią SMS
- release/build: dodano `npm run prepare:bins`, a `dev`, `build` i `preview` uruchamiają Vite przez `node`, więc po rozpakowaniu projektu nie wyskakuje już błąd uprawnień `vite` / `esbuild`

## 6.52
- Poprawka kodowania SMS: jawne `encoding=utf-8` dla SMSAPI, z zachowaniem stanu UI z 6.50.

## v6.49
- usunięty kafelek Błędy SMS z modułu SMS
- nagłówki głównej tabeli SMS łamią się do dwóch linii
- dopasowane szerokości kolumn, żeby pełne etykiety były widoczne

## 6.48
- moduł SMS: usunięto kafelek `Do zatwierdzenia`, a licznik `Klienci na liście` pokazuje teraz faktycznie klientów widocznych na liście
- moduł SMS: kafelek `Wysłane w tym miesiącu` jest klikalny i rozwija tabelę z klientami, do których w tym miesiącu wysłano przypomnienia
- moduł SMS: dodano kafelek `Błędy SMS`, żeby szybciej wychwycić nieudane wysyłki

## 6.46
- moduł SMS: status wiersza opiera się teraz także na `jobs.last_sms_status`, więc po udanej wysyłce nie zostaje już stary `błąd`
- moduł SMS: historia wysyłek została uproszczona — nie pokazuje już treści SMS, tylko status, datę, numer i ewentualny komunikat błędu
- backend SMS: udane wysyłki zapisują teraz status `provider_sent`, a do projektu dodano funkcję webhooka `smsapi-delivery-webhook` do aktualizacji na `doręczono`

## 6.45
- sms: poszerzono główną tabelę modułu SMS, aby pełne daty i akcje były zawsze widoczne
- sms: skrócono przycisk akcji z `Wyślij teraz` do `Wyślij`, żeby nie ucinał się w widoku

## 6.44
- moduł SMS: szersza tabela z poprawioną widocznością akcji i pełną datą ostatniej aktywności
- dodane checkboxy i poprawione szerokości kolumn, usunięta zbędna ciasnota widoku


## 6.43
- moduł SMS: dodane checkboxy przy wszystkich klientach gotowych do ręcznej wysyłki
- moduł SMS: usunięta kolumna daty montażu z głównej tabeli
- moduł SMS: tabela zwężona i uproszczona pod termin przeglądu
- moduł SMS: wysyłka zbiorcza działa także dla klientów bez wcześniejszego wpisu w kolejce
## 6.42
- połączono w module SMS dwie osobne tabelki (`Kolejka do zatwierdzenia` i `Szybka wysyłka ręczna`) w jedną wspólną listę klientów do obsługi, dzięki czemu cały workflow SMS jest prostszy i czytelniejszy
- wspólna lista pokazuje teraz status wiersza (`oczekuje`, `gotowe do wysyłki`, `wysłano do operatora`, `doręczono`, `błąd`) oraz odpowiednią akcję: zaznaczenie do wysyłki zbiorczej albo przycisk `Wyślij teraz`

## 6.41
- uproszczono moduł SMS do czysto ręcznego workflow: z UI zniknęły teksty i wybory trybu automatycznego, a odświeżanie listy tworzy już tylko pozycje `pending_approval`
- ustawienia modułu SMS i historia wysyłek są teraz domyślnie schowane pod osobnymi przyciskami, dzięki czemu główny widok listy do zatwierdzenia jest czystszy
- dodano mały licznik `Klienci do przypomnienia dziś` na głównym dashboardzie oraz dopracowano kafelki podsumowania w samym module SMS

## 6.40
- uproszczono metadane pod miniaturami zdjęć na mobile i desktopie: zostały tylko sama data i inicjały montera, bez ikon, żeby nic się nie nachodziło i blok zdjęć był czytelniejszy
- zaktualizowano `npm run test:smoke`, żeby pilnował tekstowego układu metadanych zdjęć bez ikon oraz nowego stylu `.photoMetaText`

## 6.39
- usunięto etykiety nad miniaturami zdjęć w karcie klienta
- uproszczono siatkę i metadane sekcji zdjęć na desktopie dla czystszego układu

## 6.38
- odchudzono główne przyciski akcji na mobile (`Edytuj`, `Usuń`, `Zakończ`, `Zamknij`) przez mniejszy padding i font, dzięki czemu dół karty klienta jest bardziej zwarty
- uproszczono metadane zdjęć na mobile: data i autor zajmują mniej pionowego miejsca dzięki bardziej kompaktowemu układowi i mniejszym ikonom
- wyłączono klikalny adres na liście desktopowej, więc Google Maps otwierają się już tylko z poziomu karty klienta
- rozszerzono `npm run test:smoke`, żeby pilnował nieklikalnego adresu w kolumnie desktopowej oraz nowych kompaktowych stylów mobile

## 6.37
- zmniejszono przycisk `Usuń` w sekcji `Komentarze i pytania` oraz ujednolicono małe przyciski destrukcyjne na karcie klienta przez wspólny styl `compactDangerBtn`, dzięki czemu nie dominują już wizualnie na mobile i desktopie
- uproszczono podpis nad miniaturami zdjęć z `Zdjęcie 1/2/3` do samego `Zdjęcie`, żeby blok zdjęć zajmował mniej miejsca i wyglądał czyściej
- rozszerzono `npm run test:smoke`, żeby pilnował nowego kompaktowego stylu przycisków `Usuń` oraz uproszczonego podpisu miniatur

## 6.36
- skrócono etykietę pod miniaturami zdjęć z `Usuń zdjęcie` do samego `Usuń`, dzięki czemu przyciski pod zdjęciami zajmują mniej miejsca zarówno na mobile, jak i desktopie
- zmniejszono przyciski usuwania pod zdjęciami i przy `Komentarzu administratora`, żeby były lżejsze wizualnie i nie dominowały karty klienta
- rozszerzono `npm run test:smoke`, żeby pilnował skróconej etykiety `Usuń` przy zdjęciach oraz nowych, mniejszych wymiarów przycisków destrukcyjnych

## 6.35
- ujednolicono przycisk `Usuń` przy sekcji `Komentarz administratora` z pozostałymi akcjami destrukcyjnymi przez wspólny styl `premiumActionBtn premiumDangerBtn`, dzięki czemu cała karta klienta ma jeden język wizualny dla akcji usuwających
- dopracowano kartę klienta na mobile: sekcje mają równiejsze odstępy pionowe, a `Aparat` i `Galeria` są pilnowane jako dwa zwarte przyciski w jednym rzędzie bez zbędnego rozciągania
- ujednolicono nagłówki sekcji `Monterzy` i `Status` do wspólnego stylu z ikonami, żeby wszystkie bloki szczegółów korzystały z tego samego wzorca sekcyjnego
- rozszerzono `npm run test:smoke`, żeby pilnował stylu przycisku usuwania notatki administratora, mobilnego układu przycisków zdjęć oraz spójnych nagłówków sekcyjnych

## 6.34
- ujednolicono przyciski `Usuń komentarz` i `Usuń kartę` z resztą akcji destrukcyjnych przez wspólny styl premium danger, dzięki czemu wszystkie usuwające akcje na karcie klienta mają jeden język wizualny
- dopracowano stan `disabled` dla przycisku `Zakończ`: zamiast ciężkiego czarnego przycisku zablokowana akcja ma teraz spokojniejszy, jaśniejszy wygląd i czytelny stan niedostępności spójny z resztą premium UI
- uproszczono mobile przyciski `Aparat` i `Galeria` do jednego rzędu z samą ikoną i krótką nazwą, bez dodatkowych opisów pod spodem, żeby sekcja zdjęć zajmowała mniej miejsca i była spójniejsza
- rozszerzono `npm run test:smoke`, żeby pilnował nowego układu uploadu zdjęć, spójnych klas destrukcyjnych przycisków oraz dopracowanego stanu `disabled` dla przycisku `Zakończ`

## 6.33
- ujednolicono przyciski `Usuń zdjęcie` i `Dodaj komentarz` z resztą akcji na karcie klienta przez wspólny styl premium, dzięki czemu sekcje zdjęć i komentarzy wyglądają spójniej z głównymi przyciskami
- dopracowano stany `disabled` dla tych akcji: zablokowane przyciski mają teraz wyraźnie spokojniejszy kolor, słabsze nasycenie i brak efektów hover, więc od razu widać, że akcja jest chwilowo niedostępna
- rozszerzono `npm run test:smoke`, żeby pilnował nowych klas przycisków, stanu `disabled` oraz blokady wysłania pustego komentarza

## 6.32
- dopracowano przyciski `Aparat` i `Galeria` w karcie klienta na desktopie i mobile: mają teraz bardziej premium styl z delikatniejszym połyskiem, lepszym obramowaniem i spójniejszym charakterem względem głównych akcji
- dodano wyraźniejszy stan `active` pod mobile oraz wygaszono efekt `hover` na małych ekranach, dzięki czemu przyciski lepiej reagują na dotyk i nie wyglądają jak przypadkowo nadmuchane karty
- rozszerzono `npm run test:smoke`, żeby pilnował nowych klas i stanów stylowania sekcji dodawania zdjęć

## 6.31
- ujednolicono przyciski `Aparat` i `Galeria` w karcie klienta na desktopie i mobile: mają teraz wspólny, bardziej dopracowany wygląd z ikoną po lewej, mocniejszą hierarchią tekstu i równym układem
- dodano delikatne opisy pomocnicze pod nazwami akcji, dzięki czemu łatwiej odróżnić szybkie zrobienie zdjęcia od wyboru plików z galerii
- rozszerzono `npm run test:smoke`, żeby pilnował nowego układu sekcji dodawania zdjęć oraz klas stylujących przyciski uploadu

## 6.30
- delikatnie wyrównano odstępy pionowe między sekcjami karty klienta przez wspólne kontenery `detailsSection` i `detailsSectionCompact`, dzięki czemu bloki `Komentarz administratora`, `Zdjęcia`, `Komentarze i pytania`, `Monterzy` i `Status` układają się równiej
- uproszczono marginesy nagłówków `sectionHeadingWithIcon`, żeby każda sekcja korzystała z jednego, przewidywalnego rytmu pionowego zamiast mieszać marginesy nagłówka z marginesami treści
- rozszerzono `npm run test:smoke`, żeby pilnował nowej struktury sekcji i spójnego stylu nagłówków sekcyjnych w `JobDetailsPanel.jsx` oraz `src/styles.css`

## 6.29
- ujednolicono nagłówek `Komentarz administratora` z pozostałymi sekcjami na karcie klienta przez wspólny styl `sectionHeadingWithIcon` i ikonę dokumentu
- uporządkowano metadane zdjęć: zamiast emoji używane są teraz spójne ikonki dla daty i autora, więc blok zdjęć lepiej pasuje do reszty interfejsu
- rozszerzono `npm run test:smoke`, żeby pilnował nowego nagłówka sekcji administratora oraz układu metadanych zdjęć z ikonami

## 6.28
- usunięto z karty klienta przyciski `Skopiuj` przy polach `Email` i `Telefon`, żeby blok informacji był prostszy i nie zawierał zbędnych akcji
- dodano czytelne ikony przy sekcjach `Zdjęcia` i `Komentarze i pytania`, dzięki czemu cała karta klienta ma bardziej spójny język wizualny
- rozszerzono `npm run test:smoke`, żeby pilnował braku przycisków kopiowania w `JobDetailsPanel.jsx` oraz obecności nowych ikon sekcyjnych

## 6.27
- ujednolicono ikonki także przy polach `Monterzy` i `Data utworzenia`, więc cały blok informacji klienta korzysta teraz z jednego wspólnego stylu etykiet z ikoną po lewej stronie
- dodano subtelne tooltipy do linków `Email`, `Telefon` i `Adres`, a `src/components/JobAddressLink.jsx` przyjmuje już własny tekst tooltipu i etykiety dostępności
- uporządkowano układ przycisków kopiowania przez wspólny kontener `infoValueActions` i wyrównane wymiary przycisku, a smoke test pilnuje nowych ikon oraz tooltipów w szczegółach karty klienta

## 6.26
- ujednolicono ikonki w bloku informacji klienta: `Email`, `Telefon`, `Adres` i `Data montażu` korzystają teraz z tego samego stylu etykiety z ikoną po lewej stronie
- uproszczono `src/components/JobAddressLink.jsx`, bo sam link adresu renderuje już tylko tekst adresu, a układ ikon jest kontrolowany przez etykiety w `JobDetailsPanel.jsx`
- zaktualizowano `npm run test:smoke`, żeby pilnował nowego wspólnego stylu etykiet w szczegółach karty klienta

## 6.25
- w karcie klienta usunięto ikonę mapy z prawej strony klikalnego adresu i przeniesiono ją do etykiety `Adres` po lewej stronie, w miejsce wcześniejszego czerwonego znacznika
- adres w szczegółach karty nadal otwiera Google Maps po kliknięciu, ale sam zapis adresu wygląda teraz spójniej z resztą pól
- zaktualizowano `npm run test:smoke`, żeby pilnował nowego układu: ikona mapy siedzi w etykiecie `Adres`, a nie przy samym linku adresowym

## 6.24
- rozszerzono `npm run test:smoke` o lekką kontrolę helpera `getGoogleMapsUrl`, żeby poprawnie generował link Google Maps także wtedy, gdy adres ma pustą ulicę albo pustą miejscowość
- smoke sprawdza teraz trzy warianty: pełny adres, samą miejscowość i samą ulicę, więc przypadkowe składanie pustych przecinków lub pustego URL zostanie szybciej wychwycone

## 6.22
- na mobilnej liście zleceń adres nie jest już osobnym linkiem; cały kafelek znowu działa jako jeden przycisk otwierający kartę klienta
- link do Google Maps pozostawiono wyłącznie w szczegółach karty klienta, więc po wejściu w zlecenie adres nadal można otworzyć bezpośrednio w mapach
- zaktualizowano `npm run test:smoke`, żeby pilnował nowego rozdziału: brak `JobAddressLink` na liście mobile i obecność linku adresu w `JobDetailsPanel.jsx`

## 6.21
- połączono `miejscowość` i `ulicę` w jeden wspólny adres na karcie klienta oraz na listach zleceń; kliknięcie adresu otwiera teraz Google Maps zarówno na mobile, jak i desktopie
- wydzielono layout zalogowanego widoku do `src/components/layout/AppAuthenticatedLayout.jsx` oraz rozbito `src/components/JobsPanel.jsx` na `src/components/jobs/MobileJobsLayout.jsx` i `src/components/jobs/DesktopJobsLayout.jsx`, dzięki czemu `src/App.jsx` dalej schudł i ma około 380 linii
- dodano wspólny komponent `src/components/JobAddressLink.jsx` i rozszerzono `npm run test:smoke` o kontrolę helperów adresu, nowego layoutu oraz wyboru karty na podstawie `jobId` w URL

## 6.20
- wydzielono logikę sesji, `refreshAll`, przywracania autoryzacji i nasłuchu zmian auth do `src/hooks/useAppSession.js`, więc główny komponent nie trzyma już bezpośrednio całego przepływu sesji
- wydzielono akcje na wybranym zleceniu do `src/hooks/useSelectedJobActions.js`, dzięki czemu usuwanie zdjęć, komentarzy i całych kart montażu oraz edycja szczegółów są zebrane w jednym miejscu
- dodano moduł `src/utils/jobSelectionState.js` do odczytu `jobId` z URL i rozszerzono `npm run test:smoke` o kontrolę nowej architektury oraz ścieżki usuwania całej karty z kontrolą `busy`

## 6.19
- wydzielono realtime i fallback refresh z `src/App.jsx` do `src/hooks/useRealtimeRefresh.js`, więc subskrypcje Supabase, polling awaryjny i odświeżanie po `focus`/`visibilitychange` są teraz w jednym miejscu
- wydzielono wspólną obsługę modala potwierdzeń do `src/hooks/useConfirmDialog.js`, dzięki czemu usuwanie zdjęć, komentarzy i kart korzysta z jednego mechanizmu sterowania `busy`
- dodano `src/hooks/usePushNotificationsState.js` oraz `src/utils/pushState.js`, więc stan powiadomień push nie siedzi już bezpośrednio w głównym komponencie
- rozszerzono `npm run test:smoke` o kontrolę nowej struktury hooków i zabezpieczeń `busy` przy usuwaniu zdjęcia oraz komentarza

## 6.18
- uporządkowano `src/App.jsx`, wydzielając stan formularza montażu do `src/hooks/useJobFormModal.js`, dzięki czemu logika brudnego formularza i potwierdzenia `Zamknij bez zapisu` nie siedzi już bezpośrednio w głównym komponencie
- wydzielono obsługę podglądu zdjęć do `src/hooks/usePhotoPreview.js` oraz resolvery guardów do `src/utils/jobAccessors.js`, co zmniejsza duplikację i upraszcza dalsze refaktoryzacje
- dodano wspólny moduł `src/utils/jobMessages.js` i zaktualizowano smoke test, żeby dalej pilnował potwierdzenia `Zamknij bez zapisu` po refaktorze

## 6.17
- uszczelniono `npm run release`: skrypt wykonuje teraz `version:bump`, `test:smoke` x2, `verify:release` x2, `build` x2, tworzy ZIP i na końcu sprawdza obecność paczki dla bieżącej wersji
- rozszerzono `scripts/verify-release.cjs`, żeby pilnował zgodności wersji między `app-version.json`, `package.json`, sekcją `Aktualna wersja`, sekcją `Ostatnia poprawka`, wpisem w `CHANGELOG.md` oraz opcjonalnie wygenerowanym ZIP-em
- wydzielono wspólny moduł `src/utils/jobPermissions.js`, a smoke test sprawdza teraz także blokady ról/statusów i obecność potwierdzenia `Zamknij bez zapisu`

## 6.16
- formularz `Nowy montaż / Edytuj montaż` korzysta teraz z tego samego wspólnego modala potwierdzeń przy próbie zamknięcia z niezapisanymi zmianami
- kliknięcie `Zamknij`, `Escape` albo overlay przy zmodyfikowanym formularzu pokazuje okno `Zamknij bez zapisu` zamiast zamykać formularz od razu
- logika porównuje stan początkowy i bieżący formularza zarówno dla nowego zlecenia, jak i edycji istniejącej karty, więc przypadkowe utracenie zmian jest zablokowane

## 6.15
- dodano wspólny modal potwierdzeń `ConfirmActionModal` z gotowymi wariantami typu `Usuń`, `Czy na pewno?` i `Zamknij bez zapisu`
- usuwanie karty montażu, zdjęć, komentarza administratora i wpisów w sekcji `Komentarze i pytania` korzysta teraz z jednego, spójnego okna potwierdzenia
- logika potwierdzeń zamyka modal dopiero po realnym sukcesie akcji, więc nie znika już „na ślepo” przy nieudanym zapisie

## 6.14
- wprowadzono wspólny system modali oparty o komponent `AppModal`, używany teraz przez formularz montażu, podgląd zdjęć, potwierdzenie usunięcia oraz mobilne `Nowe konto`
- wszystkie te okna działają już przez portal do `document.body`, mają jednolite zamykanie klawiszem `Escape`, kliknięciem w overlay i blokadę scrolla tła
- uporządkowano warstwy `z-index`, dzięki czemu modal nie powinien już chować się pod layoutem ani zachowywać się inaczej na desktopie i mobile

## 6.13
- desktop: naprawiono otwieranie modala `Edytuj montaż` z karty klienta
- formularz dodawania/edycji jest teraz renderowany przez portal React do `document.body`
- dodano wysoki `z-index` dla overlay formularza, żeby modal nie chował się pod layoutem strony

## 6.12
- domknięto blokady pracownika bezpośrednio w karcie szczegółów używanej także na mobile: zakończone zlecenie jest już tylko do podglądu, więc pracownik nie widzi akcji dodawania/usuwania zdjęć ani dodawania komentarzy
- przycisk `Zakończ zlecenie` jest teraz liczony przez wspólny helper i pokazuje się pracownikowi wyłącznie dla statusu `W trakcie`, również w widoku mobilnym
- dodano dodatkową ochronę w logice aplikacji dla prób zmiany monterów przy zakończonym zleceniu pracownika oraz komunikat `tylko do podglądu` w szczegółach karty

## 6.11
- na koncie pracownika przycisk `Zakończ zlecenie` pokazuje się już tylko dla zleceń ze statusem `W trakcie`
- jeśli zlecenie ma status `Nowe` albo `Zakończone`, pracownik nie widzi już przycisku kończenia zlecenia w karcie
- dodano też blokadę w logice aplikacji, więc pracownik nie może ustawić statusu `Zakończone`, jeśli zlecenie nie jest wcześniej w statusie `W trakcie`

## 6.10
- zlecenia ze statusem `Zakończone` są teraz zablokowane dla pracowników: nie mogą już dodawać komentarzy, dodawać ani usuwać zdjęć ani wykonywać dalszych zmian w karcie
- administrator zachowuje pełne uprawnienia do edycji zakończonych zleceń, więc w razie potrzeby nadal może poprawić dane, usunąć zdjęcie albo dodać zmianę
- karta zakończonego zlecenia pokazuje pracownikowi czytelne komunikaty, że dalsza edycja jest zablokowana

## 6.08
- zmieniono tytuł karty przeglądarki z `Klima App Tabela V2` na `Wawis klimatyzacja`
- zaktualizowano nazwę aplikacji PWA i `apple-mobile-web-app-title`, żeby branding był spójny na desktopie i po dodaniu do ekranu głównego

## 6.07
- naprawiono reset formularza `Nowy montaż` po zamknięciu edycji istniejącej karty
- po wyjściu z `Edytuj montaż` otwarcie `Nowy montaż` zawsze pokazuje czyste, puste pola
- zamknięcie modala przez przycisk `Zamknij`, klik w tło i po poprawnym zapisie czyści stan formularza

## 6.05
- naprawiono właściwą przyczynę braku usuwania wpisów w sekcji `Komentarze i pytania`: problemem była polityka RLS po stronie Supabase, a nie sam frontend
- dodano plik `comments-delete-policy.sql`, który przyznaje prawo usuwania komentarzy tylko użytkownikom z rolą `Administrator` w tabeli `profiles`
- komunikat błędu przy nieudanym usunięciu komentarza pozostaje po stronie aplikacji, ale od tej wersji paczka zawiera też brakującą poprawkę SQL do wdrożenia w Supabase

## 6.04
- naprawiono trwałe usuwanie komentarza administratora i wpisów w sekcji `Komentarze i pytania`: zapis do Supabase jest teraz weryfikowany przez `select(...)`, więc aplikacja nie uznaje już pustej odpowiedzi za sukces
- jeśli baza nie zapisze zmiany, użytkownik dostaje od razu czytelny błąd zamiast chwilowego zniknięcia komentarza i jego ponownego pojawienia się po odświeżeniu

## 6.03
- naprawiono usuwanie komentarza administratora i komentarzy w karcie montażu: po kliknięciu `Usuń` wpis znika od razu z widoku, a zmiana zapisuje się poprawnie w tle
- dodano bezpieczny rollback widoku przy błędzie zapisu, więc jeśli Supabase odrzuci usunięcie, komentarz wraca na listę zamiast znikać tylko pozornie

## 6.02
- w szczegółach karty montażu skrócono przycisk pod sekcją `Komentarz administratora` do prostego `Usuń`
- administrator może teraz usuwać pojedyncze wpisy w sekcji `Komentarze i pytania` bezpośrednio z karty montażu

## 6.01
- w szczegółach karty montażu dodano przycisk `Usuń komentarz administratora`, widoczny dla administratora pod sekcją `Komentarz administratora`
- przycisk czyści komentarz bezpośrednio z karty klienta, więc nie trzeba już wchodzić do edycji montażu tylko po to, żeby usunąć notatkę

## 6.00
- w formularzu nowego i edytowanego montażu dodano przyciski `Wyczyść datę` oraz `Wyczyść komentarz`, dzięki czemu na mobile i desktopie można jawnie usunąć datę montażu oraz komentarz administratora
- zapis formularza trzyma teraz puste wartości daty i komentarza jako `null`, więc po wyczyszczeniu pola dane naprawdę znikają z rekordu zamiast zostawać pod spodem
- zaktualizowano `version-bump.cjs`, żeby po wersji `5.99` kolejne wydanie przechodziło na `6.00`, a następne numeracje zachowywały format z dwoma cyframi po kropce

## 5.99
- formularz nowego i edytowanego montażu został lekko skompaktowany: zmniejszono górne odstępy, wysokości pól, wysokość textarea i przycisku zapisu
- modal formularza lepiej mieści się teraz na jednej stronie na desktopie, więc przycisk `Zapisz zlecenie` / `Zapisz zmiany` rzadziej wymaga przewijania

## 5.98
- formularz nowego i edytowanego montażu: zwężono badge'e instalatorów, zmniejszono odstępy i dopracowano typografię
- lista instalatorów w modalu łatwiej mieści się teraz w jednym rzędzie na desktopie

# CHANGELOG

## 7.36
- SMS/desktop-admin: wdrożono wierny layout 1:1 względem zaakceptowanego mockupu dla modułu `SMS` — stały lewy sidebar z ikonami, górny pasek użytkownika, duży nagłówek, dwa duże kafelki podsumowania, szeroki desktopowy pasek filtrów i nowa tabela z akcjami w stylu z wizualizacji.
- SMS/UX: widok `Klienci na liście` i `Wysłane w tym miesiącu` korzysta teraz z tej samej, bogatszej tabeli z kolumnami klient/model/numer seryjny/miasto/kontakt/data/status/akcje, eksportem CSV/XLSX-like oraz dolnym paskiem informacyjnym i szybkim dostępem do ustawień szablonów SMS.
- app-shell/admin: dodano nowy komponent `AdminDesktopShell`, który daje desktopowemu kontu administratora lewy sidebar, topbar użytkownika i spójny layout roboczy bez ruszania mobilki ani konta pracownika; smoke `test:smoke:desktop-refresh` został zaktualizowany pod nowy shell i nowy layout `SMS`.

## 6.23
- dodano małą ikonę mapy przy klikalnym adresie w szczegółach karty klienta, dzięki czemu łatwiej rozpoznać link otwierający Google Maps
- pozostawiono mobilną listę zleceń jako jeden cały przycisk z tekstowym adresem bez osobnego linku i rozszerzono `npm run test:smoke`, żeby pilnował tego zachowania

## 6.19
- wydzielono realtime i fallback refresh z `src/App.jsx` do `src/hooks/useRealtimeRefresh.js`, więc subskrypcje Supabase, polling awaryjny i odświeżanie po `focus`/`visibilitychange` są teraz w jednym miejscu
- wydzielono wspólną obsługę modala potwierdzeń do `src/hooks/useConfirmDialog.js`, dzięki czemu usuwanie zdjęć, komentarzy i kart korzysta z jednego mechanizmu sterowania `busy`
- dodano `src/hooks/usePushNotificationsState.js` oraz `src/utils/pushState.js`, więc stan powiadomień push nie siedzi już bezpośrednio w głównym komponencie
- rozszerzono `npm run test:smoke` o kontrolę nowej struktury hooków i zabezpieczeń `busy` przy usuwaniu zdjęcia oraz komentarza

## 6.18
- uporządkowano `src/App.jsx`, wydzielając stan formularza montażu do `src/hooks/useJobFormModal.js`, dzięki czemu logika brudnego formularza i potwierdzenia `Zamknij bez zapisu` nie siedzi już bezpośrednio w głównym komponencie
- wydzielono obsługę podglądu zdjęć do `src/hooks/usePhotoPreview.js` oraz resolvery guardów do `src/utils/jobAccessors.js`, co zmniejsza duplikację i upraszcza dalsze refaktoryzacje
- dodano wspólny moduł `src/utils/jobMessages.js` i zaktualizowano smoke test, żeby dalej pilnował potwierdzenia `Zamknij bez zapisu` po refaktorze

## 6.09
- dodano favicon i dodatkowy wpis ikony PWA oparte o firmowe logo `logo.png`, dzięki czemu karta przeglądarki i skrót aplikacji wyglądają bardziej firmowo
- rozszerzono wyszukiwanie zleceń o numer telefonu klienta, więc filtr `Filtruj klienta, telefon...` znajduje teraz rekordy także po polu `phone`

## 6.06
- usuwanie komentarzy z sekcji `Komentarze i pytania` korzysta teraz z funkcji RPC `admin_delete_comment`, więc administrator nie blokuje się już na politykach RLS przy kasowaniu komentarza
- dodano plik `comments-delete-function.sql` do uruchomienia w Supabase SQL Editor; funkcja sprawdza rolę `Administrator` i usuwa komentarz po stronie bazy
- poprawiono komunikat błędu w frontendzie: jeśli funkcja nie jest wdrożona, aplikacja podpowiada dokładnie brakujący plik SQL

## 5.97
- dodano prosty test smoke `npm run test:smoke`, który sprawdza logowanie i pierwsze odświeżenie danych przez `refreshAppData()` na mockowanym Supabase
- test pokrywa także regresję z `normalizeStatus`, więc przy kolejnych zmianach szybciej wyłapie błąd podobny do tego z wersji 5.95/5.96

## 5.96
- naprawiono błąd logowania po wersji 5.95: `refreshAppData()` znowu dostaje poprawnie `normalizeStatus`, więc ekran `Logowanie zakończone. Trwa ładowanie danych...` nie zawiesza się już na błędzie `TypeError: normalizeStatus is not a function`
- dodano bezpieczny fallback w `src/modules/jobs-fetch.js`, żeby synchronizacja starych statusów korzystała z domyślnego `normalizeStatus` nawet wtedy, gdy wywołanie nie przekaże go jawnie

## 5.95
- usunięto wysyłkę maili o przypisaniu montażu; aplikacja korzysta teraz wyłącznie z powiadomień push
- uproszczono logikę przypisań w `src/modules/jobs-assignment.js`, `src/modules/jobs-form.js` i `src/App.jsx`, usuwając nieużywaną ścieżkę mailową
- usunięto plik backendowy `api/send-assignment-email.js`, bo nie jest już potrzebny w aktualnym przepływie aplikacji

## 5.94
- przyspieszono zapis edycji montażu: aplikacja nie czeka już na wysyłkę maili i pushy o nowym przypisaniu przed zamknięciem okna edycji
- zapis przypisań w `src/modules/jobs-form.js` działa teraz różnicowo: usuwa tylko odpięte osoby i dodaje tylko nowe, zamiast kasować i tworzyć cały `job_access` od zera
- dodano bezpieczne uruchamianie powiadomień w tle z logowaniem błędów, żeby ewentualny problem z mailem albo pushem nie blokował użytkownikowi zapisu zmian

## 5.93
- ograniczono automatyczne odświeżanie danych: usunięto agresywny polling co 2 sekundy, zostawiono realtime + odświeżanie po `focus` i `visibilitychange`, a fallback polling działa teraz co 30 sekund
- naprawiono wywołanie `refreshAll(sessionUser, true)` w `src/modules/photos.js`, przekazując poprawny obiekt opcji `refreshAll(sessionUser, { silent: true })`
- dodano pełniejsze sprawdzanie błędów w `src/modules/notifications.js`, żeby błędy zapisu i oznaczania powiadomień nie ginęły po cichu
- lekko odchudzono `refreshAppData()` przez wydzielenie pomocniczych kroków pobierania profilu, zespołu, zleceń i danych powiązanych bez zmiany działania aplikacji
- uporządkowano `README.md`: usunięto zduplikowany wpis modułu zleceń i dopisano standard wydania nowej wersji oraz paczkowania ZIP

## 5.92
- przyspieszono logowanie, bo aplikacja po poprawnym haśle nie czeka już na pełne dociągnięcie wszystkich danych z Supabase przed przejściem dalej
- po zalogowaniu pokazuje się teraz krótki ekran `Logowanie zakończone. Trwa ładowanie danych...`, zamiast sprawiać wrażenie, że przycisk `Zaloguj` nie działa
- zmniejszono ryzyko wielokrotnych kliknięć `Zaloguj` na mobile, bo ciężkie odświeżanie danych dzieje się już w tle po udanym logowaniu

## 5.91
- wyciszono surowy komunikat `TypeError: NetworkError when attempting to fetch resource` i zastąpiono go czytelniejszym tekstem o chwilowym problemie z połączeniem
- odświeżanie danych korzysta teraz ze starych danych `profiles` i `notifications`, gdy Supabase chwilowo zwróci błędy 502/503/504, zamiast od razu rozbijać widok czerwonym paskiem
- usunięto automatyczny zapis subskrypcji push przy każdym odczycie statusu i dodano blokadę/cooldown dla `push_subscriptions`, żeby przy 403 nie spamować requestami

## 5.90
- ukryto techniczną diagnostykę push pod przyciskiem `Push`; panel pokazuje już tylko status i przycisk włączania/wyłączania
- dodano pole `Data montażu` do formularza dodawania i edycji zlecenia oraz do karty klienta w szczegółach zlecenia
- dodano plik `installation-date.sql` do Supabase, żeby dodać kolumnę `installation_date` w tabeli `jobs`

## 5.89
- dodano pełną konfigurację PWA dla iPhone/Safari: `public/manifest.webmanifest`, `display: standalone`, `start_url`, `scope`, `theme-color` oraz meta tagi Apple w `index.html`, żeby aplikacja z ekranu głównego była rozpoznawana jako właściwa web app
- rozbudowano diagnostykę push w panelu użytkownika: status pokazuje teraz także przyczynę niedostępności, m.in. HTTPS, Service Worker, Push API, zgodę na powiadomienia i tryb uruchomienia z ikony na iPhonie
- poprawiono logikę wykrywania wsparcia push na iOS, tak żeby aplikacja odróżniała zwykłą kartę Safari od uruchomienia z ikony na ekranie głównym

## 5.88
- Naprawiono znikające ikony statusów w desktopowym górnym pasku po ostatnich zmianach nagłówka.
- Obrazy statusów są teraz importowane do bundla Vite zamiast ładowane z publicznej ścieżki, więc po deployu ścieżki ikon są stabilne.

## 5.86
- desktop: dodatkowo zwężono pole `Filtruj`, panel `Push` i pole użytkownika, żeby dolny pasek mieścił się w jednej linii
- desktop: status push został skrócony do `Push aktywne` / `Push nieaktywne`, żeby odzyskać miejsce na nazwę użytkownika

## 5.85
- desktop: zmniejszono panel push oraz pole użytkownika w dolnym pasku nagłówka
- desktop: `Filtruj`, `Push` i zalogowany użytkownik mieszczą się teraz w jednej linii
- desktop: zachowano pełną szerokość pola filtra, a elementy po prawej są bardziej kompaktowe

## 5.84
- poprawiono miganie dolnego panelu szczegółów na mobilnym koncie pracownika w zakładce `W trakcie`: podczas otwartego szczegółu zlecenia wyłączono cykliczne odświeżanie co 2 sekundy, żeby widok nie resetował się i nie przeładowywał danych klienta
- zachowano odświeżanie przez realtime, focus okna i zmianę widoczności, więc dane nadal odświeżają się bez ręcznego przeładowania

## 5.83
- poprawiono autoryzację wywołania Edge Function `send-assignment-push`: dodano `supabase/config.toml` z `verify_jwt = false`, żeby bramka Supabase nie odrzucała żądania błędem `Invalid JWT`, a autoryzacja administratora była sprawdzana już wewnątrz funkcji
- dopisano lepszy log błędu HTTP po stronie frontendu przy nieudanym wywołaniu push, żeby łatwiej było diagnozować problemy po przypisaniu montera

## 5.82
- poprawiono wywołanie push po przypisaniu montażu: aplikacja wywołuje Edge Function bezpośrednio przez fetch z tokenem sesji administratora
- dodano lepsze logowanie diagnostyczne w Edge Function `send-assignment-push`
- dodano wpisy `skipped` do `push_delivery_log`, gdy użytkownik nie ma aktywnej subskrypcji

## 5.81
- wdrożono push powiadomienia webowe dla przypisań montaży: dodano frontend obsługi subskrypcji, service workera i przycisk włączania powiadomień
- dodano backendową Edge Function `supabase/functions/send-assignment-push/index.ts` oraz plik `push-notifications.sql` do konfiguracji tabel i RLS w Supabase
- przypisanie montera wysyła teraz nie tylko mail, ale też próbę wysłania push do aktywnych subskrypcji przypisanych pracowników

## 5.80
- rozdzielono `src/modules/jobs-data.js` na `src/modules/jobs-fetch.js`, `src/modules/jobs-crud.js` i `src/modules/jobs-form.js`
- `src/modules/jobs.js` oraz `src/App.jsx` korzystają teraz z cieńszej warstwy eksportów, a odpowiedzialności za pobieranie danych, CRUD i obsługę formularza są rozdzielone
- uzupełniono `README.md`, żeby opisywał nowy podział modułów zleceń bez zmiany działania aplikacji

## 5.79
- rozbito `src/modules/jobs.js` na mniejsze moduły: `src/modules/jobs-data.js`, `src/modules/jobs-comments.js`, `src/modules/jobs-assignment.js` i `src/modules/jobs-selectors.js`
- `src/App.jsx` korzysta teraz bezpośrednio z nowych modułów, więc odpowiedzialności za zlecenia, komentarze, przypisania i selektory są wyraźniej rozdzielone
- `src/modules/jobs.js` został zostawiony jako cienki plik zbiorczy eksportów, żeby dalej mieć jedno miejsce wejścia do modułu zleceń

## 5.78
- rozdzielono logikę z `src/App.jsx` na moduły `src/modules/auth.js`, `src/modules/jobs.js`, `src/modules/photos.js` i `src/modules/notifications.js`
- dodano `src/lib/supabase.js`, żeby konfiguracja klienta Supabase nie była już trzymana bezpośrednio w głównym komponencie aplikacji
- `src/App.jsx` został odchudzony i pełni teraz głównie rolę spinającą stan, efekty i widoki, bez mieszania całej logiki biznesowej w jednym pliku

## 5.77
- `README.md` został uzupełniony o krótką mapę akcji biznesowych pokazującą, gdzie w kodzie są obsługiwane logowanie, dodanie i edycja zlecenia, usuwanie zdjęcia oraz tworzenie powiadomień
- dokumentacja wskazuje teraz szybkie punkty wejścia do najważniejszych akcji operacyjnych w `src/App.jsx`, `AuthScreen.jsx`, `JobFormModal.jsx` i `JobDetailsPanel.jsx`
- uporządkowano dokumentację techniczną bez zmiany działania aplikacji

## 5.76
- `README.md` został uzupełniony o krótką sekcję architektury danych opisującą źródła i przepływ danych dla ról użytkowników, zleceń, zdjęć i powiadomień
- dokumentacja wskazuje teraz główne miejsca w kodzie odpowiedzialne za pobieranie danych w `src/App.jsx` oraz za ich prezentację w panelach i tabeli desktopowej
- uporządkowano dokumentację techniczną bez zmiany działania aplikacji

## 5.75
- release ZIP nie dodaje już pustego katalogu `docs/`, bo skrypt paczkowania pomija wpisy katalogów i wyklucza cały `docs`
- `README.md` został uzupełniony o krótką sekcję struktury komponentów, w tym `src/components/modals/*`
- uporządkowano dokumentację techniczną projektu bez zmiany działania aplikacji

## 5.74
- przeniesiono roboczy plik `desktop_table_preview.html` do katalogu `docs/preview/desktop_table_preview.html`
- uporządkowano strukturę projektu, żeby pliki podglądu nie leżały już w katalogu głównym aplikacji
- zaktualizowano release ZIP tak, żeby katalog `docs/preview` nie trafiał do paczki do podmiany

## 5.73
- skrócono `README.md` do zasad projektu, aktualnej wersji, komend i informacji technicznych
- usunięto z `README.md` rozproszoną historię zmian, żeby nie dublowała `CHANGELOG.md`
- pełna historia wersji pozostaje teraz wyłącznie w `CHANGELOG.md`

## 5.72
- uporządkowano `CHANGELOG.md` do jednego spójnego nagłówka i jednej chronologicznej listy wersji
- usunięto zduplikowany nagłówek `# CHANGELOG` i scalono rozjechane sekcje historii zmian
- zachowano dotychczasową historię wersji od `5.51`, ale w czytelnym, jednolitym układzie

## 5.71
- desktop: reguły badge'y dla kolumny `Monter` zostały przeniesione do wspólnej konfiguracji `desktop-jobs-table.columns.jsx`
- desktop: szerokość rzędu badge'y, zawijanie, odstępy oraz rozmiar badge'y są teraz sterowane z jednego miejsca razem z resztą modelu tabeli
- `src/styles/desktop-jobs-table.css` pobiera teraz z konfiguracji także layout badge'y montera, więc kolejne poprawki nie będą już rozrzucane między CSS i React

## 5.70
- desktop: do konfiguracji `src/components/desktop-jobs-table.columns.jsx` dodano ustawienia wewnętrznych wrapperów kolumn: `contentJustifyContent`, `contentAlignItems`, `contentTextAlign`, `contentWidth`, `contentMinWidth`, `contentMaxWidth` i `contentMinHeight`
- renderery komórek korzystają teraz ze wspólnego wrappera `.desktopCellContent`, więc `Status`, `Adres`, `Monter` i `Data` są sterowane deklaratywnie z jednego miejsca
- `src/styles/desktop-jobs-table.css` pobiera teraz z konfiguracji także układ wewnętrznych kontenerów, a nie tylko szerokości i padding

## 5.69
- desktop: do konfiguracji `src/components/desktop-jobs-table.columns.jsx` dodano także `textAlign`, `whiteSpace` i `paddingInlineStart` / `paddingInlineEnd` dla każdej kolumny
- `DesktopJobsTableHeader.jsx`, `DesktopJobsTableRow.jsx` i `DesktopJobsTableColGroup` oznaczają teraz kolumny przez `data-column`, dzięki czemu CSS przypina się do wspólnej konfiguracji zamiast do kolejności `nth-child`
- `src/styles/desktop-jobs-table.css` korzysta teraz z tych samych zmiennych layoutu co React, więc szerokości, wyrównania, zawijanie tekstu i padding są sterowane z jednego miejsca

## 5.68
- desktop: model szerokości kolumn został przeniesiony do wspólnej konfiguracji `desktop-jobs-table.columns.jsx`
- tabela ustawia teraz szerokości przez wspólne zmienne CSS generowane z konfiguracji, więc React i CSS korzystają z jednego źródła prawdy

## 5.67
- desktop: komponent wiersza tabeli został podpięty pod tę samą wspólną konfigurację kolumn co nagłówek
- desktop: renderowanie komórek jest teraz sterowane z `desktop-jobs-table.columns.jsx`, co upraszcza zmianę kolejności pól i przyszłe ukrywanie kolumn

## 5.66
- wydzielono osobny plik `src/components/desktop-jobs-table.columns.jsx` z konfiguracją kolumn desktopowej tabeli
- `DesktopJobsTableHeader.jsx` pobiera teraz definicje kolumn z osobnego pliku, co upraszcza utrzymanie nazw, szerokości i sortowania
- przygotowano jedno wspólne miejsce pod dalszą rozbudowę konfiguracji kolumn

## 5.65
- wydzielono osobny komponent `src/components/DesktopJobsTableRow.jsx` dla pojedynczego wiersza desktopowej tabeli
- logika renderowania klienta, statusu, adresu, montera i daty została przeniesiona z `JobsPanel.jsx` do osobnego komponentu
- `JobsPanel.jsx` został uproszczony, bo składa teraz desktopowy widok listy z nagłówka, wiersza i osobnych styli

## 5.64
- wydzielono osobny komponent `src/components/DesktopJobsTableHeader.jsx` dla nagłówka desktopowej tabeli
- konfiguracja kolumn desktopowych jest teraz utrzymywana w jednym pliku razem z obsługą sortowania
- `JobsPanel.jsx` został uproszczony, bo renderuje gotowy komponent nagłówka i gotowy `colgroup`

## 5.63
- wydzielono osobny plik `src/styles/desktop-jobs-table.css` tylko dla desktopowego layoutu tabeli zleceń
- usunięto z `src/styles.css` sekcję stylów tabeli desktopowej, żeby nie mieszała się z resztą styli aplikacji
- `src/main.jsx` importuje teraz osobny plik stylów dla tabeli desktopowej, co ułatwia dalsze poprawki i zmniejsza ryzyko nadpisań

## 5.62
- desktop: nagłówek kolumny `Instalatorzy` w tabeli został zmieniony na `Monter`
- skrócono nazwę kolumny, żeby była czytelniejsza i zajmowała mniej miejsca

## 5.61
- desktop: w kolumnie `Instalatorzy` badge instalatorów mogą teraz zawijać się do drugiego rzędu
- desktop: trzeci i kolejni instalatorzy pokazują się pod spodem zamiast rozszerzać układ w poziomie

## 5.60
- naprawiono pozycję dolnej linii w kolumnie `Data` w desktopowej tabeli
- komórka daty znów zachowuje się jak zwykła komórka tabeli, a samo wyśrodkowanie jest robione wewnętrznym wrapperem

## 5.59
- desktop: naprawiono widoczność kolumny `Data` w tabeli zleceń
- desktop: tabela ma teraz stałe szerokości dla `Status`, `Instalatorzy` i `Data`, żeby nic nie ucinało prawej strony
- desktop: `Adres` dalej bierze resztę miejsca, ale już nie wypycha daty poza widok

## 5.58
- desktop: uporządkowano layout tabeli zleceń w jednej dedykowanej sekcji CSS
- desktop: usunięto rozproszone i konfliktujące reguły dla `.desktopJobsTable`
- desktop: szerokości, wyrównania i pionowe pozycjonowanie tabeli są teraz utrzymywane w jednym miejscu

## 5.57
- desktop: wyrównano pionowo zawartość wierszy tabeli zleceń
- desktop: `Status`, `Adres`, `Data` i `Instalatorzy` są ustawione w jednej osi optycznej

## 5.56
- desktop: wyśrodkowano kolumnę `Adres` w tabeli zleceń
- desktop: nagłówek i zawartość `Adres` są teraz centrowane

## 5.55
- desktop: naprawiono realne zwężenie kolumny `Status` w tabeli zleceń
- desktop: `Status` jest teraz liczony praktycznie do szerokości badge'a
- desktop: `Adres` dostaje odzyskane miejsce po zwężeniu `Status`
- dodano `README.md`
- dodano `CHANGELOG.md`
- dodano `verify:release`

## 5.51
- wersja bazowa otrzymana do dalszych zmian

## 6.47
- Moduł SMS: po wysyłce rekord znika z listy klientów do obsługi, jeśli status jest wysłano lub doręczono.
- Licznik „Do przypomnienia dziś” nie zlicza już klientów po udanej wysyłce.
- Historia wysyłek otwiera się automatycznie po wysyłce i pokazuje tylko status oraz błąd.
- Status provider_sent wyświetla się jako „wysłano”.

## 7.07
- SMS: po wysłaniu klient znika z listy bieżącej dla danego cyklu.
- SMS: licznik 'Klienci na liście' jest klikalny i przewija do tabeli kolejki.
- SMS: ręczna wysyłka przekazuje reminder_cycle i reminder_due_date, żeby nie wracać na listę po wysłaniu.
