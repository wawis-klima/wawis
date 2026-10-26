# WAWIS — kopie zapasowe w Cloudflare R2

## Co robi system

Codziennie ok. 01:20–02:20 (czas polski) workflow GitHub Actions **„WAWIS backup to R2”**:

1. **Baza danych**
   - Wykonuje zrzut (`pg_dump`) schematów `public`, `private`, `auth`, `storage` i `supabase_migrations`.
   - Szyfruje go (AES-256) i wysyła do R2: `db/daily/RRRR/MM/<znacznik>/`.
   - Pobiera wysłany plik z powrotem i porównuje sumę SHA-256.
   - 1. dnia miesiąca kopiuje zrzut dodatkowo do `db/monthly/RRRR-MM/`.
2. **Pliki** — buckety `job-photos`, `job-protocols`, `job-protocol-signatures`, `fuel-odometer-photos`:
   - **Kopia przyrostowa:** wysyłane są tylko nowe pliki.
   - **Historia:**
     - plik usunięty w Supabase zostaje w kopii;
     - plik w kopii nigdy nie jest nadpisywany. Zmiana istniejącego pliku przerywa kopię i jest zgłaszana jako błąd integralności.
   - **Szyfrowanie:** treść plików jest szyfrowana przed wysyłką. Nazwy (identyfikatory montaży) pozostają czytelne.
   - **Weryfikacja:** każdy plik źródłowy jest porównany z kopią po sumie kontrolnej. Raport podaje liczbę plików, rozmiar i liczbę plików 0 B w źródle.
3. **Próba odtworzenia**
   - Odbywa się na maszynie CI, w izolowanym kontenerze `supabase/postgres` — nigdy na produkcji.
   - Workflow pobiera ostatnią kopię z R2, sprawdza sumy i odszyfrowuje ją, a następnie odtwarza bazę.
   - Liczba wierszy każdej tabeli musi być zgodna z liczbą na produkcji w chwili zrzutu.
   - Każdy nieoczekiwany błąd `pg_restore` oznacza nieudaną kopię.
4. **Powiadomienie**
   - Nieudana kopia otwiera zgłoszenie (Issue) z etykietą `backup-failure`, a GitHub wysyła powiadomienie właścicielowi.
   - Kolejna udana kopia zamyka zgłoszenie.

Produkcja jest wyłącznie **odczytywana**: konto bazy tylko do odczytu, a klucze Storage służą tylko do pobierania plików.

Test działania skryptów na fikcyjnych danych, bez sekretów, robi workflow **„WAWIS backup self-test”** przy każdej zmianie w `scripts/backup/`:

- kopia przyrostowa;
- zachowanie usuniętego pliku w kopii;
- wykrycie nadpisania pliku;
- zaszyfrowanie plików w kopii;
- odtworzenie bazy;
- wykrycie uszkodzonej kopii.

---

## Konfiguracja — kroki dla właściciela (jednorazowo, ok. 30 minut)

> Sekrety wpisujesz wyłącznie w panelach Cloudflare / Supabase / GitHub. **Nie wysyłaj ich przez czat.** Claude nie potrzebuje ich znać.

### Krok 1. Hasło szyfrowania kopii

1. W menedżerze haseł (np. iCloud Keychain / 1Password) wygeneruj hasło: **co najmniej 32 znaki, tylko litery i cyfry**.
2. Zapisz je jako: **„WAWIS — hasło szyfrowania kopii zapasowych”**.
   - **Bez tego hasła kopii nie da się odczytać.**
   - Zachowaj je też poza telefonem, np. wydrukowane w sejfie.
3. Będzie potrzebne w kroku 5 jako `BACKUP_ENCRYPTION_PASSPHRASE`.

### Krok 2. Cloudflare R2 — bucket

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **R2 Object Storage**. Jeśli to pierwszy raz, aktywuj R2. Cloudflare może poprosić o kartę płatniczą; przy naszej ilości danych (ok. 1 GB) mieścimy się w bezpłatnym limicie 10 GB.
2. **Create bucket**:
   - Name: `wawis-backup`
   - Location: **Specify jurisdiction → European Union** (dane klientów pozostają w UE)
   - **Create bucket**.
3. W buckecie → **Settings**:
   - **S3 API** — skopiuj adres. Ma postać `https://<id>.eu.r2.cloudflarestorage.com/wawis-backup`. Do kroku 5 potrzebna jest część **bez** `/wawis-backup` → zmienna `R2_ENDPOINT`.
   - **Bucket lock rules → Add rule** (ochrona przed usunięciem, także przez kogoś z kluczem):

     | Nazwa | Prefiks | Okres |
     |---|---|---|
     | `kopie-dzienne` | `db/daily/` | 30 dni |
     | `kopie-miesieczne` | `db/monthly/` | 365 dni |
     | `pliki` | `files/` | 90 dni |

   - **Object lifecycle rules → Add rule** (automatyczne sprzątanie starych kopii bazy):

     | Nazwa | Prefiks | Działanie |
     |---|---|---|
     | `usun-dzienne` | `db/daily/` | Delete objects after **90 dni** |
     | `usun-miesieczne` | `db/monthly/` | Delete objects after **1095 dni** (3 lata) |

     Dla `files/` **nie dodajemy** reguły usuwania.
4. **Nie** włączaj „Public access” ani domeny publicznej dla tego bucketu.

### Krok 3. Cloudflare R2 — klucz dostępu tylko do tego bucketu

1. R2 Object Storage → **Manage R2 API Tokens** (lub „API” → „Manage API tokens”) → **Create API token**:
   - Token name: `wawis-backup-github`
   - Permissions: **Object Read & Write**
   - Specify bucket(s): **Apply to specific buckets only → `wawis-backup`**
   - TTL: Forever
2. **Create API Token**. Skopiuj **Access Key ID** i **Secret Access Key** (sekret jest pokazywany tylko raz) → krok 5: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.

### Krok 4. Supabase — dostęp do odczytu

**4a. Konto bazy tylko do odczytu**

1. [supabase.com/dashboard](https://supabase.com/dashboard) → projekt WAWIS → **SQL Editor** → New query.
2. Wklej poniższy kod.
   - W miejsce `WPISZ_DLUGIE_HASLO` wpisz **nowe** hasło: 32+ znaki, tylko litery i cyfry, inne niż w kroku 1.
   - Zapisz je w menedżerze haseł jako „WAWIS — konto kopii bazy”.

   ```sql
   create role wawis_backup login bypassrls password 'WPISZ_DLUGIE_HASLO';
   grant pg_read_all_data to wawis_backup;
   alter role wawis_backup set default_transaction_read_only = on;
   ```

3. **Run**. Konto widzi wszystkie dane (to wymagane do pełnej kopii), ale **nie może niczego zmienić**.
4. Projekt WAWIS → przycisk **Connect** (u góry) → zakładka **Connection String** → **Session pooler** → skopiuj adres. Ma postać:

   ```
   postgresql://postgres.uohziyaudbpwmupvljyd:[YOUR-PASSWORD]@aws-…-eu-central-1.pooler.supabase.com:5432/postgres
   ```

   Zamień `postgres.` na `wawis_backup.` oraz `[YOUR-PASSWORD]` (razem z nawiasami) na hasło konta `wawis_backup`, wpisane w poleceniu SQL powyżej — **nie** hasło szyfrowania z kroku 1 ani klucze Cloudflare. Okno „Connect” niczego nie zapisuje: gotowy adres przygotuj w notatniku/menedżerze haseł. Wynik:

   ```
   postgresql://wawis_backup.uohziyaudbpwmupvljyd:TWOJE_HASLO@aws-…-eu-central-1.pooler.supabase.com:5432/postgres
   ```

   → krok 5: `BACKUP_DB_URL`.

**4b. Pobieranie plików (protokół S3 Storage)**

1. Projekt WAWIS → **Project Settings** → **Storage** → sekcja **S3 Connection**.
2. Włącz **Enable connection via S3 protocol** (jeśli wyłączone) → **Save**.
3. **New access key** → opis `wawis-backup` → **Create**. Skopiuj **Access key ID** i **Secret access key** (sekret widoczny tylko raz) → krok 5: `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY`.
4. Odczytaj **Region** z tej strony (oczekiwane `eu-central-1`) → zmienna `SUPABASE_REGION`.

> Klucz S3 Supabase daje pełny dostęp do plików. Przechowujemy go wyłącznie w środowisku GitHub `wawis-backup`, dostępnym tylko dla workflow kopii z gałęzi `main`. Kod kopii wyłącznie pobiera pliki z Supabase.

### Krok 5. GitHub — środowisko z sekretami

1. [github.com/wawis-klima/wawis](https://github.com/wawis-klima/wawis) → **Settings** → **Environments** → **New environment** → nazwa: `wawis-backup` → **Configure environment**.
2. **Deployment branches and tags** → **Selected branches and tags** → **Add deployment branch or tag rule**:
   - `main`
   - `ops/backup-r2` (tymczasowo, do próbnej kopii; po scaleniu do `main` usuń tę regułę)
3. **Environment secrets** → **Add environment secret** (nazwa → wartość):

   | Nazwa | Wartość |
   |---|---|
   | `BACKUP_DB_URL` | adres z kroku 4a |
   | `BACKUP_ENCRYPTION_PASSPHRASE` | hasło z kroku 1 |
   | `SUPABASE_S3_ACCESS_KEY_ID` | z kroku 4b |
   | `SUPABASE_S3_SECRET_ACCESS_KEY` | z kroku 4b |
   | `R2_ACCESS_KEY_ID` | z kroku 3 |
   | `R2_SECRET_ACCESS_KEY` | z kroku 3 |

4. **Environment variables** → **Add environment variable**:

   | Nazwa | Wartość |
   |---|---|
   | `SUPABASE_PROJECT_REF` | `uohziyaudbpwmupvljyd` |
   | `SUPABASE_REGION` | `eu-central-1` (lub region z kroku 4b) |
   | `R2_ENDPOINT` | adres S3 API z kroku 2 **bez** `/wawis-backup` |
   | `R2_BUCKET` | `wawis-backup` |

5. Napisz Claude'owi: „Kopie skonfigurowane”. Claude uruchomi próbną kopię i sprawdzi wynik (tylko odczyt produkcji).

**Powiadomienia:** upewnij się, że w GitHub → avatar → **Settings → Notifications** masz włączone e-maile dla „Issues” w repozytoriach, które obserwujesz (domyślnie włączone).

---

## Odtwarzanie danych

**Zasada:** odtwarzanie wyłącznie do **osobnego środowiska** (lokalny kontener lub osobny projekt Supabase). Przeniesienie czegokolwiek na produkcję wymaga decyzji właściciela i jest osobną, opisaną operacją.

### A. Automatyczna próba (codziennie)

Krok „Restore test” w workflow. Wynik w podsumowaniu przebiegu i w artefakcie `restore-report.json`.

### B. Ręczne odtworzenie bazy (np. do sprawdzenia, co było w montażu tydzień temu)

Wymagane: `rclone`, `gpg`, PostgreSQL 17 (klient), Docker, hasło szyfrowania.

```bash
export BACKUP_DEST=r2:wawis-backup BACKUP_ENCRYPTION_PASSPHRASE='…'   # rclone skonfigurowany jak w workflow
export RESTORE_PREFIX=db/daily/2026/10/20261026T002000Z               # albo pominąć = ostatnia kopia
bash scripts/backup/restore-verify.sh                                  # odtwarza w kontenerze i sprawdza liczby
```

Do przeglądania danych pozostaw kontener (zakomentuj `trap cleanup EXIT`) i połącz się z `postgresql://supabase_admin:restore-only@127.0.0.1:54329/postgres`.

### C. Odtworzenie plików

Wybrany plik lub katalog montażu:

```bash
rclone copy r2crypt:job-photos/<id_montażu>/ ./odtworzone/
```

`r2crypt` odszyfrowuje automatycznie. Wgranie z powrotem do Supabase tylko po decyzji właściciela, poleceniem `rclone copy ./odtworzone/ sb:job-photos/<id_montażu>/` (bez nadpisywania istniejących).

### D. Utrata projektu Supabase (scenariusz awaryjny)

1. Nowy projekt Supabase (region `eu-central-1`, Postgres 17).
2. Odtworzenie bazy z ostatniej kopii (`pg_restore` jak w `restore-verify.sh`, do nowego projektu).
3. Pliki: `rclone copy r2crypt:<bucket> sb-nowy:<bucket>` dla każdego bucketu.
4. Edge Functions z `supabase/functions/` (wdrożenie) i sekrety z listy w `docs/` (wartości od właściciela).
5. Vercel: nowe `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY` → wdrożenie.
6. Szacowany czas: pół dnia (do potwierdzenia pierwszą pełną próbą).

---

## Kryteria gotowości systemu kopii

- [x] Workflow „backup self-test” zielony.
- [x] Pierwsza kopia z produkcji: baza, pliki i próba odtworzenia — OK (26.10.2026, ok. 10 min; ostrzeżenie: 13 historycznych plików 0 B w job-photos — raport z 26.10).
- [ ] Ręczny test odtworzenia 3 losowych zdjęć i 1 protokołu: pliki otwierają się poprawnie.
- [ ] 7 kolejnych udanych kopii dziennych (etap potwierdzenia niezawodności, nie blokuje innych prac).
- [ ] Test powiadomienia: ręczne uruchomienie (workflow_dispatch) z celowo błędną zmienną w kontrolowanych warunkach tworzy zgłoszenie `backup-failure`, a następna udana kopia je zamyka.
