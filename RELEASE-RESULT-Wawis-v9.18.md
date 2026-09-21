# RELEASE RESULT - Wawis 9.18

## Wersja
- 9.18

## Zakres
- naprawiono błąd RLS przy ponownym włączaniu push na iPhonie używanym wcześniej na innym koncie aplikacji,
- mobile nie wykonuje już bezpośredniego UPSERT-u `push_subscriptions`; synchronizacja przechodzi przez uwierzytelnioną Edge Function,
- backend może przepisać dokładny endpoint do aktualnie zalogowanego użytkownika wyłącznie gdy `p256dh` i `auth` zgadzają się z istniejącą subskrypcją,
- RLS pozostaje włączone i restrykcyjne,
- administrator na mobile ma widoczny panel `Diagnostyka` pod sekcją Push zamiast ikony dokumentu w górnym pasku,
- panel zawiera `Wyślij test push na ten telefon` oraz `Pobierz raport diagnostyczny`,
- nagłówek administratora ma teraz tylko `Dodaj` i `Przeładuj`,
- zachowano retry 409 i powiadomienia `job_completed` z 9.17.

## Supabase
- produkcyjna Edge Function `send-assignment-push` została wdrożona jako wersja 11 i jest ACTIVE,
- nie ma nowej migracji SQL wymaganej do ręcznego uruchomienia przed wdrożeniem aplikacji,
- polityki RLS tabeli `push_subscriptions` nie zostały poluzowane.

## Testy lokalne
- `test:smoke:push-mobile-reassignment` — PASS,
- `test:smoke:push-reliability` — PASS,
- `test:smoke:mobile-admin-header` — PASS,
- `test:smoke:mobile-new-job-no-devices` — PASS,
- `test:smoke:job-completion` — PASS,
- `test:smoke:assignment-push` — PASS,
- `test:smoke:version` — PASS.

## Wdrożenie
1. Rozpakuj paczkę 9.18.
2. Wdróż aplikację do właściwego projektu Vercel `wawis-klima` przez `vercel.cmd --prod`.
3. Edge Function jest już wdrożona w produkcyjnym Supabase.
4. Na iPhonie otwórz aplikację ponownie; subskrypcja powinna zsynchronizować się z bieżącym kontem bez błędu RLS.
5. W panelu `Diagnostyka` użyj `Wyślij test push na ten telefon`.
