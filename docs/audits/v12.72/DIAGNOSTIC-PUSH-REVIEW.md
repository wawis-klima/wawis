# WAWIS 12.72 — pakiet kontrolny Diagnostyka / PUSH

Data kontroli: 8 października 2026, godz. około 18:00 czasu polskiego.
Okno źródłowe: 1–8.10.2026. Odczyty **tylko do wglądu**, bez wysyłania PUSH i bez modyfikacji bazy.

## Ustalenia z produkcji
- `app_diagnostic_events`: 351 zapisów; 60 błędów, 291 ostrzeżeń; **1 raportujące konto** (desktop i mobile). Nie jest to pełna telemetria wszystkich urządzeń.
- `refreshAll failed`: 21 błędów, dotychczas opis `[object Object]`; wiele ostrzeżeń `Failed to fetch` / `Load failed` / `AbortError`. W logach PostgreSQL występował `canceling statement due to statement timeout` (`SQLSTATE 57014`). Nie ma podstaw, aby wszystkie problemy przypisywać wyłącznie DB lub wyłącznie sieci.
- `push_subscriptions`: **4 aktywne subskrypcje pracowników**, 3 z aktywnością w ostatnich 7 dniach.
- `push_delivery_log`: **18** automatycznych `job_assigned` do pracowników w badanym okresie; tylko 4 z nich mają token potwierdzenia (nowy mechanizm), **0 / 4** ma potwierdzenie `received_at` albo `displayed_at`. Starszych 14 bez tokenów nie wolno traktować jako nieodebranych na podstawie nowych pól.
- `job_completed`: 8 zdarzeń do administratora bez tokenów potwierdzeń (stare wydania — brak możliwości wiarygodnej oceny dostarczenia).
- Dzisiejszy `push_test`: **1 wysłany / 1 odebrany / 1 wyświetlony**, także ręcznie potwierdzony na iPhonie przez administratora.
- 4 nowe `job_assigned` uzyskały HTTP **201** od dostawcy Push. Jest to przyjęcie do wysyłki, **nie** dowód wyświetlenia na urządzeniu.
- RLS `push_delivery_log` pozwala użytkownikowi czytać własne wpisy. Z tego powodu nie wystawiamy surowych dzienników wszystkich pracowników do mobilnego panelu administratora bez osobnego, bezpiecznego modelu agregacji.

## Zakres zmian
1. Wspólny i ograniczony słownik kodów technicznych dla mobile i desktop, bez danych klientów/URL/stack trace w centralnych wpisach. Osobno klasyfikowane m.in. APP_REFRESH_TIMEOUT, SUPABASE_REQUEST_TIMEOUT, DB_STATEMENT_TIMEOUT, NETWORK_FETCH_FAILED, NETWORK_REQUEST_ABORTED, POSTGREST_SCHEMA_CACHE, AUTH_REFRESH_FAILED.
2. Odczyt błędów `console.error('refreshAll failed', error)` zachowuje techniczny kod wyjątku zamiast serializować obiekt jako `[object Object]`; bez zmiany samej logiki montażów, SMS-ów ani automatycznego PUSH.
3. W administracyjnej Diagnostyce desktopowej obok zdarzenia pojawia się bezpieczny kod i skrócony opis. Starsze rekordy pozostają nienaruszone.
4. Testy kodów i prywatności są obowiązkowe w grupie `core` oraz pełnej bramce CI.

## Dalsze sprawdzenie na telefonach
- **Nie jest jeszcze potwierdzona dostawa automatycznego PUSH do telefonów pracowników.** Potrzebny kolejny rzeczywisty `job_assigned` po aktualizacji Service Workera / zwykłym otwarciu aplikacji przez monterów, a następnie kontrola pary `received_at` i `displayed_at`. Brak tych pól może oznaczać stary Service Worker, problem z połączeniem telemetrii, pominięcie zdarzenia lub niedostarczenie — nie wolno utożsamiać go automatycznie z awarią.
- Po wdrożeniu weryfikujemy, czy nowe wpisy `refreshAll` mają `error_code` zamiast `[object Object]`. Jeśli w logach utrzymują się `DB_STATEMENT_TIMEOUT`, osobno analizujemy konkretne zapytania PostgreSQL i ich plan.
- Test produkcyjny wykonać bez generowania sztucznych zleceń oraz bez masowej wysyłki PUSH/SMS.

## Status
Analiza potwierdzona. Zmiany kodu wymagają zielonych testów i potwierdzenia wdrożenia nowej wersji. Test automatycznego PUSH na telefonie pracownika pozostaje otwartą obserwacją produkcyjną.
