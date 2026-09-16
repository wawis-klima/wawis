## 10.76
- aplikacja mobilna dezaktywuje endpoint PUSH przed usunięciem sesji Auth i wykonuje lokalne `PushSubscription.unsubscribe()`,
- awaria sieci przy logout zapisuje minimalny retry w `localStorage`; po następnym logowaniu ten sam endpoint może przejść z konta A na B tylko przy zgodności endpointu, `p256dh` i `auth`,
- jeśli lokalny unsubscribe się udał, stare konto jest czyszczone po sieci zamiast przypisywania starego endpointu do nowego konta,
- zachowano dotychczasowe odświeżenie danych po `SIGNED_IN`, żeby poprawka PUSH nie zmieniała timingu ładowania montaży, zdjęć ani tabliczek po logowaniu,
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
- Poprawiono zachowanie przycisku `Zrealizowane` w mobilnym nagłówku administratora.
- Zachowano dokładnie 1 px luzu przy lewej krawędzi i usunięto przypadkowe nadpisania selektora, które powodowały zmianę geometrii.
- Dodano test regresji układu górnego menu.

## 10.72
- Poprawiono odstępy w mobilnym nagłówku administratora: inicjały użytkownika nie przyklejają się do prawej krawędzi, a elementy są równiej rozłożone.
- Ujednolicono zachowanie na iPhone i Androidzie, bez zmiany funkcji aplikacji.

## 10.71
- Uporządkowano proces MICRO UI tak, aby CSS-only nie uruchamiał pełnego finalnego release przed merge.
- Dodano osobny gate Vercela dla mikro zmian CSS.

## 10.70
- Zabezpieczono automatyczne wydania przez `RELEASE-GATE.json`, obowiązkowy backup Drive i twardy post-deploy evidence.

## 10.69
- Usprawniono wizualne kontrole desktop/mobile oraz skrócono zestaw testów dla bezpiecznych zmian UI.
