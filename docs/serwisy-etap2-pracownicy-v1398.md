# WAWIS — Serwisy, etap 2: udostępnienie pracownikom (plan, 30.10.2026)

**Status: PLANOWANE — WYMAGA AKCEPTACJI WŁAŚCICIELA.** Ten dokument nie włącza żadnego dostępu.
Do czasu decyzji moduł serwisowy pozostaje wyłącznie dla Administratora (stan 13.98).

Podstawa: audyt kodu 13.96/13.98, migracje `supabase/migrations/*service_visit*`, odczytowe `SELECT` na produkcji
(30.10.2026: 3 wizyty, 4 konta Pracownik, 1 Administrator; pracownik widzi `contractors` i `profiles` przez
`current_user_is_staff()`, nie widzi `devices` — wizyta ma własne migawki modelu i numeru seryjnego, więc nie jest to potrzebne).

## 1. Zasady, których plan nie zmienia

- SMS tylko przypomina; nie tworzy i nie planuje wizyt. Cykle 1–5 nadal od daty montażu.
- Jedna wizyta = wiele urządzeń, jeden podpis, jeden PDF. Sześć czynności na urządzenie, zdjęcie przy usterce.
- Zdjęcia tylko online (decyzja 13.66), bez nowej lokalnej kolejki.
- Podpis, PDF i PUSH — istniejące mechanizmy, bez przebudowy.
- Kosz, przywracanie, trwałe usuwanie, odwołanie, zmiana terminu i obsady — **tylko Administrator**.
- Obecne polityki `*_admin_*` pozostają bez zmian; dostęp pracownika to **nowe, osobne** polityki i funkcje.

## 2. Etap 2.0 — domknięcie serwera przed rozszerzeniem dostępu (wymagany najpierw)

Audyt 13.98 wykazał lukę, która przy pracownikach stałaby się istotna (`SA-1398-BACKEND-OPEN`):
serwer nie sprawdza `deleted_at`, więc wizyta w Koszu może zostać zmieniona lub zakończona, jeżeli klient pominie UI.

| Miejsce | Zmiana |
|---|---|
| `service_visit_admin_save_item`, `_wait_for_signature`, `_complete`, `_cancel` | `select … deleted_at … for update`; jeśli `deleted_at is not null` → wyjątek „Serwis jest w koszu”. |
| `UPDATE service_visits` (kolumny terminu/przydziału) | W `service_visit_assignment_audit` (trigger BEFORE UPDATE): blokada zmian terminu/przydziału/uwag, gdy `old.deleted_at is not null` (z wyjątkiem samego przywracania przez RPC). |
| Storage `service_visit_files_admin_upload`, `service_visit_photos_admin_insert` | Dodatkowy warunek `v.deleted_at is null`. |
| `get_service_visit_completed_push_event_v1389` | Warunek `v.deleted_at is null` (spójnie z PUSH przydziału z 13.94). |

Test: pglite (jak `codex-acceptance-*-v1269`) — wizyta w Koszu odrzuca każdą z operacji; po przywróceniu działają.
To zmiana schematu produkcyjnego → wymaga zgody właściciela.

## 3. Model dostępu pracownika

**Uczestnik wizyty** = `auth.uid() = primary_technician_id` lub `auth.uid() = any(additional_technician_ids)`.
**Pula do podjęcia** = `primary_technician_id is null`, `cardinality(additional_technician_ids)=0`,
`status='zaplanowany'`, `deleted_at is null`.

| Operacja | Administrator | Pracownik — uczestnik | Pracownik — pula | Pracownik — cudza wizyta |
|---|---|---|---|---|
| Lista i szczegóły wizyty, klient, urządzenia wizyty | tak | tak | tak (do podjęcia) | **nie** |
| Podjęcie zlecenia | — | — | tak (atomowo) | nie |
| Zapis czynności i wyniku, zdjęcia usterek | tak | tak | nie (najpierw podjęcie) | nie |
| Oczekiwanie na podpis, podpis, PDF, zakończenie | tak | tak | nie | nie |
| Otwarcie / druk PDF swojej wizyty | tak | tak | nie | nie |
| E-mail z protokołem | tak | **WYMAGA DECYZJI** (proponuję: nie) | nie | nie |
| Termin, obsada, odwołanie, Kosz, trwałe usunięcie | tak | nie | nie | nie |
| Wizyty w Koszu | tak | nie | nie | nie |

## 4. SQL / RLS (jedna nowa migracja, wdrażana „w ciemno” z wyłączonym przełącznikiem)

1. **Przełącznik etapu** — `private.service_worker_stage_v1399(enabled boolean)` (jeden wiersz) i funkcja
   `private.service_worker_stage_enabled()` `stable security definer`. Domyślnie `false`. Każda nowa polityka
   i funkcja pracownicza zawiera ten warunek, więc migracja po wdrożeniu niczego nie udostępnia.
   Włączenie i wycofanie = zmiana jednego wiersza (bez nowego deployu).
2. **Funkcje pomocnicze** (`security definer`, `set search_path=''`):
   `private.service_visit_is_participant(visit_id)`, `private.service_visit_in_pool(visit_id)`.
3. **Nowe polityki SELECT** (tylko `to authenticated`, warunek: `current_user_is_staff()` i przełącznik):
   `service_visits` (uczestnik lub pula, `deleted_at is null`), `service_visit_devices`, `service_visit_photos`,
   `service_visit_protocols` (tylko uczestnik), `service_visit_assignment_events` (tylko uczestnik).
   Brak polityk dla `service_visit_protocol_email_log`, `service_visit_change_events` i tabel `private.*`.
4. **Bez bezpośrednich zapisów pracownika.** Granty kolumnowe UPDATE pozostają chronione triggerem
   `service_visit_assignment_audit` (wymaga admina). Wszystkie zapisy przez RPC.
5. **Podjęcie zlecenia — `public.service_visit_worker_claim(p_visit_id uuid) returns boolean`**:
   jedna instrukcja `update … set primary_technician_id=auth.uid() where id=p_visit_id and primary_technician_id is null
   and cardinality(additional_technician_ids)=0 and status='zaplanowany' and deleted_at is null returning id`.
   Blokada wiersza gwarantuje jednego zwycięzcę; przegrany dostaje `false` i komunikat „Zlecenie podjął już ktoś inny”.
   Trigger audytu przydziału musi dopuścić tę jedną ścieżkę (zmienna transakcyjna ustawiana `set_config(…, true)`
   wyłącznie wewnątrz RPC, sprawdzana w triggerze razem z warunkiem `new.primary_technician_id = auth.uid()`
   i `old.primary_technician_id is null`). Historia (`service_visit_assignment_events.changed_by`) zapisze kto i kiedy.
6. **Wykonanie** — zamiast kopiować logikę: wydzielić ciało `save_item`, `wait_for_signature`, `complete` do
   `private.*_core(...)` z kontrolą `admin OR (uczestnik AND przełącznik)` i `deleted_at is null`;
   nazwy `service_visit_admin_*` zostają (zgodność z obecnym frontendem), dochodzą `service_visit_worker_*`
   wołające ten sam rdzeń. `performed_by = auth.uid()` — bez zmian (rzeczywisty wykonawca).
7. **Storage `service-visit-files`** — nowe polityki `select`/`insert` dla uczestnika, ścieżka
   `<visit_id>/photos|signatures|pdf/…`, `status not in ('wykonany','odwolany')`, `deleted_at is null`.
   Brak `update`/`delete` dla pracownika (usuwanie wyłącznie przez `purge-service-visit`).

## 5. Zmiana obsady w trakcie pracy

- Administrator zmienia przydział jak dziś; usunięty pracownik traci widoczność od razu (RLS).
- Zapisane wyniki i zdjęcia zostają, `performed_by` wskazuje faktycznego wykonawcę; nowy pracownik widzi postęp.
- Otwarty ekran wykonania u odsuniętego pracownika: następny zapis dostaje odmowę RPC → komunikat
  „Zlecenie przekazano innej osobie”, bez zielonego potwierdzenia.
- Realtime nie jest wymagany na start; lista odświeża się przy wejściu i po każdej akcji.

## 6. PUSH

- Przydział przez administratora — istniejący mechanizm 13.93/13.94 bez zmian (już obejmuje pracowników).
- Podjęcie z puli — **bez** PUSH do osoby podejmującej (enqueue pomija `recipient = changed_by`);
  **WYMAGA DECYZJI**: czy administrator ma dostać PUSH „Pracownik X podjął zlecenie”.
- Zakończenie — istniejący PUSH do administratora; zdarzenie nadal z triggera po rzeczywistym `status='wykonany'`.
- Nowe zlecenie w puli — **WYMAGA DECYZJI** (proponuję: brak PUSH do wszystkich na start).
- Ownership generation i kontekst SW — bez zmian; `refreshServicePushContext` jak dziś.

## 7. Frontend (iPhone pracownika)

- Zakładka „Serwisy” u pracownika pojawia się **tylko**, gdy RPC `service_worker_stage_enabled()` zwróci `true`
  (4 zakładki zamiast 3 — test szerokości 320–430 px jak w 13.90).
- `WorkerServicePanel`: „Moje” (przydzielone, najbliższe najpierw) i „Do podjęcia”; karta: termin, klient, adres,
  telefon, liczba urządzeń, status (`serviceVisitStatusLabel`).
- „Podejmij zlecenie” → wynik wyłącznie z serwera; przy konflikcie lista odświeża się i pokazuje komunikat.
- Wykonanie: ten sam `ServiceExecutionPanel` z parametrem roli — bez e-maila (do decyzji), bez akcji administracyjnych;
  wywołania RPC przez wspólną warstwę wybierającą `admin`/`worker`.
- Brak wyszukiwarki klientów, Kosza, planowania i zmiany obsady.

## 8. Testy (Closure Gate)

| Warstwa | Zakres |
|---|---|
| SQL (pglite) | Macierz: admin / pracownik-uczestnik / pracownik-obcy / pracownik-pula / anon × SELECT każdej tabeli i każde RPC; przełącznik `false` = pracownik nic nie widzi; wizyta w Koszu niewidoczna i nieedytowalna. |
| Wyścig podjęcia | Dwie niezależne sesje PostgreSQL (`pg_backend_pid()` różne): dokładnie jeden `true`, drugi `false`, jedno zdarzenie w historii, końcowy `primary_technician_id` = zwycięzca. Na gałęzi Supabase lub lokalnym Postgres, nie na produkcji. |
| Storage | Pracownik nie odczyta ani nie wgra pliku cudzej wizyty; nie usunie żadnego pliku. |
| Moduły JS | Warstwa RPC admin/worker, obsługa konfliktu podjęcia, utrata przydziału w trakcie. |
| Playwright Chromium + WebKit | Pracownik: lista, podjęcie, wykonanie, podpis, PDF; brak elementów administracyjnych; hit-test przycisków; 4 zakładki na 320–430 px. |
| Regresja | Montaże, zdjęcia/tabliczki, protokoły montażowe, SMS, paliwo — pełny profil CRITICAL. |
| iPhone (po wdrożeniu) | Jeden pracownik testowy, wizyta testowa właściciela, bez danych klientów. |

## 9. Bezpieczne uruchomienie

1. **2.0** — migracja domknięcia Kosza (sekcja 2) + testy → wdrożenie (zgoda właściciela).
2. **2.1** — migracja etapu pracowniczego z przełącznikiem `false` + testy RLS i wyścigu → wdrożenie (zgoda).
   Kontrola po wdrożeniu (`SELECT`): pracownik nie widzi żadnej wizyty.
3. **2.2** — frontend za przełącznikiem → zwykłe wydanie.
4. **2.3** — właściciel włącza przełącznik na czas testu z jednym pracownikiem i wizytą testową; po teście ocena.
5. **2.4** — decyzja o włączeniu dla wszystkich. Wycofanie w każdej chwili: przełącznik `false`
   (widoczność znika natychmiast; dane i historia zostają).

## 10. Decyzje właściciela

1. Zgoda na etap 2.0 (zmiana RPC/polityk Storage — domknięcie Kosza po stronie serwera).
2. Czy pracownik może wysyłać e-mail z protokołem (propozycja: nie, tylko administrator).
3. PUSH do administratora po podjęciu zlecenia z puli (tak/nie).
4. PUSH do wszystkich pracowników o nowym zleceniu w puli (propozycja: nie na start).
5. Czy podjęcie z puli może zrobić tylko jedna osoba (główny), a dodatkowych dopisuje wyłącznie administrator (propozycja: tak).
6. Czy wizytę z kilkoma urządzeniami wolno zakończyć, gdy część urządzeń ma „Nie wykonano” (dziś: tak, PDF to pokazuje).
