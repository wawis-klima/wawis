# RELEASE RESULT

## Wersja
- 12.25

## Zakres
- naprawa bardzo wolnego ładowania desktopowego modułu SMS i timeoutów przy wejściu;
- brak równoległego generatora kolejki przy pierwszym odczycie;
- snapshot SMS jest wykonywany przed dociągnięciem pełnej bazy urządzeń;
- deduplikacja równoległych identycznych snapshotów SMS;
- brak zbędnego pobierania katalogu kontrahentów i metryk Centrum 360 podczas pracy w SMS;
- czytelny komunikat błędu zamiast `[object Object]`;
- trzy kafle: „Klienci na liście”, „Wysłane w tym miesiącu”, „Niewysłane” w jednym rzędzie na desktopie;
- mobile791 bez zmian funkcjonalnych.

## Baza / backend
- brak migracji;
- brak zmian RLS, Storage, Edge Functions i danych produkcyjnych.

## Diagnostyka startowa
- CHECKED;
- w logach potwierdzono timeout `admin_get_sms_module_snapshot` po ok. 45–58 s oraz równoległe wolne/503 odczyty wywołane z jednej sesji desktopowej;
- poprawka ogranicza równoległość i zbędne zapytania po stronie klienta.

## Kontrola regresji
- `scripts/smoke-sms-desktop-load-v1225.cjs`: PENDING CI
- pozostałe testy dobrane przez `release-impact`: PENDING CI
- Vercel: PENDING
- merge: PENDING
