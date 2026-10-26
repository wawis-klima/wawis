# WAWIS — procedura wycofania wadliwego wdrożenia

**Plan Vercel:** Hobby (zespół `wawis`, projekt `wawis-klima`, domena `wawis-klima.vercel.app`).

**Ograniczenia Hobby (dokumentacja Vercel):**

- natychmiastowy rollback (*Instant Rollback*) działa **tylko do bezpośrednio poprzedniego** wdrożenia produkcyjnego;
- cofnięcie do dowolnej starszej wersji jest dostępne tylko na Pro.

**Dostęp:** Claude ma dostęp do Vercel (od 25.10.2026) i wykonuje procedurę samodzielnie. Właściciel dostaje raport.
**Próbne cofanie działającej produkcji:** nie wykonujemy. Testowana jest wyłącznie analiza (sekcja 4).

---

## 1. Kiedy cofać

| Objaw | Działanie |
|---|---|
| Monterzy nie mogą pracować: logowanie, lista montaży, status, zdjęcie, tabliczka, protokół; pętla przeładowań; biały ekran | **Droga A** natychmiast, potem **Droga C** |
| Zagrożenie danych: puste pliki, nadpisywanie, znikanie rekordów | **Najpierw zatrzymanie** (Droga A), potem diagnoza. Bez napraw w ciemno. |
| Błąd uciążliwy, ale praca możliwa | **Droga C** (poprawka albo przywrócenie kodu jako nowa wersja) |

Źródła sygnału:

- telemetria `app_diagnostic_events` — błędy nowej wersji u więcej niż jednej osoby;
- zgłoszenie od monterów;
- `SELECT` na nowych zdjęciach (rozmiar > 0 B).

---

## 2. Drogi wycofania

### Droga A — natychmiastowy rollback do poprzedniego wdrożenia (minuty)

Działa tylko wtedy, gdy wadliwa jest **ostatnia** wersja, a poprzednia była dobra.

1. Przed cofnięciem sprawdzam:
   - poprzednie wdrożenie ma wersję ≥ **13.62** (sekcja 3);
   - nie ma migracji bazy, których poprzedni kod nie obsługuje.
2. Vercel: rollback do poprzedniego wdrożenia produkcyjnego — narzędzie `request_rollback` (MCP Vercel) albo panel → Deployments → poprzednie → **Instant Rollback**.
3. **Ważne:** po rollbacku Vercel **wyłącza automatyczne przypisywanie domeny** nowym wdrożeniom z `main`. Po naprawie (Droga C) nowe wdrożenie trzeba ręcznie przywrócić: panel → **Undo Rollback / Promote** albo narzędzie `request_promote`. W przeciwnym razie poprawka „wdroży się”, ale nie będzie widoczna pod adresem produkcyjnym.
4. Kontrola:
   - `/app-version.json` = poprzednia wersja (odczyt przez Vercel MCP `web_fetch_vercel_url`, nie zwykły web fetch z pamięcią podręczną);
   - telemetria: urządzenia zgłaszają poprzednią wersję;
   - brak nowych błędów.

### Droga B — awaryjne ponowne wdrożenie starszego commita (kilka minut)

Tylko gdy Droga A nie wystarcza: wadliwe są dwie ostatnie wersje, a monterzy nie mogą pracować.

1. **Najpierw analiza zgodności** (sekcja 4): `node scripts/rollback/prepare-restore-release.cjs --target <wersja>`. Wynik **NO-GO** = nie wdrażać tej wersji.
2. Vercel: nowe wdrożenie produkcyjne z commita wybranej wersji na `main` (panel → Deployments → wybrane wdrożenie tej wersji → **Redeploy**). Build przechodzi bramki `vercel-deploy-guard` i `release-policy-gate`, bo commit pochodzi z `main` i ma `ready_for_main=true`.
3. Skutki uboczne:
   - numer wersji na produkcji **maleje**: telefony wykryją inną wersję i przeładują się na starszą; service worker starszej wersji usunie cache nowszej;
   - **dlatego Droga B jest dozwolona tylko po zielonej analizie z sekcji 4.**
4. Następnie zawsze Droga C, żeby `main` znów odpowiadał produkcji, a numer wersji znów rósł.

### Droga C — standard: nowa wersja z kodem przywróconym albo naprawionym (ok. 1 godz.)

Zalecana zawsze, także po A i B.

**Wariant C1 — przywrócenie kodu starszej wersji jako nowej wersji:**

```bash
git fetch origin
node scripts/rollback/prepare-restore-release.cjs --target 13.67                 # analiza (bez zmian)
node scripts/rollback/prepare-restore-release.cjs --target 13.67 --apply --reason "błąd X w 13.70"
```

Skrypt tworzy lokalną gałąź `release/v<bieżąca+1>`:

- **Kod aplikacji** (`src/`, `public/`, `api/`, testy aplikacji) pochodzi z wersji docelowej.
- **Zostają z `main`:**
  - workflowy, bramki i dokumentacja;
  - `supabase/` — baza nie jest cofana;
  - skrypty kopii zapasowych i procedur;
  - `CHANGELOG.md` i `README.md`.
- **Numer wersji rośnie.** Nowy cache service workera wymusza normalną aktualizację telefonów bez obniżania czegokolwiek.

Dalej zwykły proces: przegląd diffu → push → PR → `targeted-checks` + Closure Gate + E2E (Chromium, WebKit) → scalenie → wdrożenie → kontrola.

**Wariant C2 — poprawka błędu jako nowa wersja** (zwykły tryb pracy).

---

## 3. Dane lokalne PWA — zasady przy każdym wycofaniu

Pełna tabela: `docs/LOCAL-DATA-COMPAT.json` (czytana automatycznie przez skrypt).

| Element | Zasada |
|---|---|
| **Minimalna wersja** | **13.62.** Starsze otwierają `wawis-mobile-photo-queue` z numerem 3, a telefony z bazą v4 dostają `VersionError` — zapis zdjęć przestaje działać. |
| `wawis-mobile-photo-queue` | Od 13.62 otwierana bez numeru. Każda wersja ≥ 13.62 jest zgodna. |
| `wawis-mobile-offline-data` (statusy, komentarze) | Otwierana z numerem 2. Wersja docelowa musi mieć `DB_VERSION` ≥ 2. **Zakaz podnoszenia tej wersji** do czasu przejścia na otwieranie bez numeru (plan, etap E4). |
| `wawis-app-read-cache` | Jak wyżej (v1). |
| Service worker | Starszy `push-sw.js` usuwa tylko `wawis-app-shell-*` innych wersji. `wawis-nameplate-readers-v1` (13.70+) zostaje — nieszkodliwy. PUSH: starszy kod musi obsługiwać format powiadomień — przed wycofaniem sprawdzić diff `push-sw.js` i Edge Functions PUSH między wersjami. |
| `localStorage` | Klucze tylko dodawane. Starszy kod ignoruje nieznane. |
| Szkic urządzeń (13.68) | Tylko w pamięci, ginie przy przeładowaniu. Przed wycofaniem w godzinach pracy: komunikat do monterów „zapisz otwarte formularze”. |

**Czego nigdy nie robimy:**

- zdalne czyszczenie IndexedDB, cache czy localStorage telefonów w kodzie;
- obniżanie numeru wersji lokalnej bazy;
- usuwanie niewysłanych danych bez decyzji użytkownika.

---

## 4. Zgodność z Supabase

**Baza nie jest cofana przy wycofaniu frontendu.** Kod starszej wersji musi działać z bieżącą bazą.

- **Zasada zmian bazy (od teraz):** najpierw tylko dodawanie (*expand*): nowe kolumny, nowe funkcje (`_v2`). Usuwanie starych kolumn i funkcji (*contract*) najwcześniej 2 wydania później, po upewnieniu się, że żadna wersja ≥ minimalnej ich nie używa.
- **Kontrola automatyczna:** skrypt wypisuje zmienione pliki bazy po wersji docelowej i listę funkcji RPC używanych przez jej kod, wraz z zapytaniem `SELECT` sprawdzającym ich istnienie na produkcji. Wynik musi być pusty (poza znanymi wyjątkami poniżej).
- **Znany wyjątek** (stan 25.10.2026): `get_storage_backup_overview` — używana przez Diagnostykę także w bieżącej wersji, a na produkcji nie istnieje (pozostałość niewdrożonego mechanizmu kopii). Diagnostyka obsługuje jej brak. Nie blokuje przywrócenia.
- **Edge Functions:** jeśli wersja docelowa wywołuje funkcję w innym formacie niż obecnie wdrożona, przywrócenie wymaga też starszej wersji funkcji. To decyzja właściciela (zmiana backendu).
- **Ostateczność:** przywrócenie bazy z kopii (Supabase daily / R2) — tylko po decyzji właściciela, nigdy automatycznie.

**Próba z 25.10.2026 (tylko analiza):**

- `--target 13.67` → **GO**: IndexedDB zgodne, brak zmian bazy, 38 funkcji RPC — wszystkie istnieją poza znanym wyjątkiem;
- `--target 13.61` → **NO-GO**: poniżej minimalnej 13.62, `VersionError` kolejki zdjęć.

---

## 5. Raport po wycofaniu (dla właściciela)

- co się stało i od kiedy;
- którą drogę zastosowano;
- wersja przed i po;
- kontrola produkcji (`/app-version.json`, telemetria, zdjęcia);
- dalsze kroki (C1 / C2) i termin.
