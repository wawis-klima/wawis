# RELEASE RESULT - Wawis 9.17

## Wersja
- 9.17

## Zakres
- uszczelniono cały łańcuch powiadomień push administratora,
- lokalny stan przeglądarki nie wystarcza już do etykiety `Push aktywne`; wymagany jest również aktywny wpis bieżącego endpointu w Supabase,
- przy uruchomieniu aplikacji, `focus`, `pageshow` i powrocie z tła bieżąca subskrypcja jest samoczynnie zapisywana/odświeżana w `push_subscriptions`, razem z `last_seen_at`,
- desktopowa Diagnostyka ma przycisk `Wyślij testowe powiadomienie push`; test nie zmienia żadnego zlecenia i trafia do aktywnych urządzeń zalogowanego administratora,
- mobilna ikona Diagnostyki administratora nie pobiera już od razu raportu: otwiera małe menu z `Wyślij test push na ten telefon` oraz `Pobierz raport diagnostyczny`,
- mobilny test filtruje dokładny endpoint bieżącego telefonu, dzięki czemu wynik nie jest maskowany przez inne urządzenie administratora,
- Edge Function `send-assignment-push` obsługuje nowe zdarzenie `push_test`, wyłącznie dla roli Administrator, i zapisuje wynik w `push_delivery_log`,
- `job_completed` ponawia odczyt statusu zlecenia po stronie serwera w krótkich kontrolowanych odstępach,
- klient ponawia wywołanie zakończenia wyłącznie dla HTTP 409; inne błędy nie są automatycznie powtarzane,
- istniejąca ochrona przed duplikatem `job_completed` pozostaje zachowana.

## Supabase
- brak nowej migracji SQL,
- wymagane jest ponowne wdrożenie Edge Function `send-assignment-push`,
- funkcja nadal używa istniejących sekretów VAPID i istniejących tabel `push_subscriptions` / `push_delivery_log`.

## Diagnostyka produkcyjna wykonana przed zmianą
- produkcyjna Edge Function była wywoływana przy zakończeniach,
- w logach występowały odpowiedzi HTTP 409 dla części wywołań,
- istnieje aktywna subskrypcja iPhone administratora,
- co najmniej jeden `job_completed` został przyjęty przez Apple Web Push z kodem 201, co potwierdziło działanie od Supabase do serwera Apple i uzasadniło dodanie testu konkretnego urządzenia.

## Testy lokalne
- `test:smoke:push-reliability` sprawdza synchronizację serwerową subskrypcji, test push desktop/mobile, filtrowanie endpointu oraz retry 409,
- zachowano istniejące testy `test:smoke:assignment-push`, `test:smoke:job-completion`, `test:smoke:mobile-admin-header` i `test:smoke:version`.

## Wdrożenie
1. Wdróż Edge Function `send-assignment-push` z wersji 9.17.
2. Wdróż aplikację 9.17 do właściwego projektu Vercel `wawis-klima` przez `vercel.cmd --prod`.
3. Po wejściu na iPhonie do aplikacji status push sam zsynchronizuje bieżący endpoint z Supabase.
4. W ikonie Diagnostyki na iPhonie wybierz `Wyślij test push na ten telefon` — bez zamykania żadnego zlecenia.
