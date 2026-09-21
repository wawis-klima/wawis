# RELEASE RESULT - Wawis 9.14

## Wersja
- 9.14

## Zakres
- dodano rzeczywisty znacznik `jobs.completed_at` ustawiany dokładnie przy przejściu zlecenia do statusu `Zakończone`,
- dodano `jobs.completed_by`, aby administrator widział również kto zakończył zlecenie,
- administrator widzi datę i godzinę zakończenia w szczegółach montażu zarówno na desktopie, jak i w widoku mobilnym,
- zlecenia zakończone przed 9.14 nie dostają sztucznie wymyślonej godziny; interfejs pokazuje brak historycznej informacji,
- ponowne otwarcie zlecenia czyści metadane zakończenia, a kolejne zakończenie zapisuje nowy czas,
- istniejący system web push został rozszerzony o zdarzenie `job_completed`,
- po skutecznym przejściu do `Zakończone` aplikacja wywołuje push do aktywnych subskrypcji administratorów,
- nieudany push nie cofa zapisanego zakończenia,
- Edge Function ponownie sprawdza status zlecenia po stronie serwera oraz dostęp pracownika do wskazanego montażu,
- zachowano dotychczasowe powiadomienia push o przypisaniu montażu.

## Migracja Supabase
Przed wdrożeniem aplikacji uruchom w Supabase SQL Editor:
- `job-completion-tracking-v9.14.sql`

Skrypt dodaje `completed_at`, `completed_by` oraz trigger `trg_jobs_completion_metadata`. Nie uzupełnia sztucznie czasu dla starych zakończonych zleceń.

## Edge Function
Po uruchomieniu SQL trzeba ponownie wdrożyć istniejącą funkcję:
- `supabase/functions/send-assignment-push/index.ts`

Funkcja nadal obsługuje `job_assigned`, a dodatkowo obsługuje `job_completed` i wysyła powiadomienie do profili `Administrator` z aktywną subskrypcją push.

## Kontrola wykonana lokalnie — 2 przebiegi PASS
- `test:smoke:job-completion`,
- `test:smoke:assignment-push`,
- `test:smoke:version`,
- `test:smoke:admin-worker`,
- `test:smoke:nameplate-finish-verification`,
- `test:smoke:desktop-nameplate-verification-status`,
- `test:smoke:desktop-refresh`,
- `test:smoke:lazy-details`,
- `test:smoke:selection`,
- `test:smoke:realtime-lite`,
- `test:smoke:e2e-mobile`,
- `test:smoke:e2e-desktop`.

Dodatkowo `node --check` potwierdził składnię zmienionych modułów JS bez JSX.

## Build / Playwright
- próba `npm ci --ignore-scripts --no-audit --no-fund` zatrzymała się przed kompilacją na błędzie infrastruktury rejestru: E404 dla `yallist-3.1.1.tgz` przekierowanego przez wewnętrzny gateway,
- z tego powodu lokalny Vite build i Playwright nie zostały uruchomione,
- błąd wystąpił podczas pobierania zależności, przed kompilacją kodu 9.14.

## Wdrożenie
1. Uruchom `job-completion-tracking-v9.14.sql` w Supabase SQL Editor.
2. Ponownie wdróż Edge Function `send-assignment-push` z katalogu `supabase/functions/send-assignment-push`.
3. Wdróż aplikację 9.14 przez `vercel.cmd --prod`.
4. Na telefonie administratora włącz istniejące powiadomienia push w aplikacji, jeśli nie są jeszcze aktywne.
5. Zakończ testowe zlecenie z konta pracownika i sprawdź push oraz pole `Zakończono` w szczegółach administratora.
