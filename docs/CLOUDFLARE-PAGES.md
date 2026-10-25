# Cloudflare Pages a WAWIS — analiza i bezpieczne wyłączenie

**Data:** 25.10.2026 · **Wniosek:** integracja Cloudflare Pages **nie jest używana** przez WAWIS. Można bezpiecznie wyłączyć jej automatyczne budowanie. Nie wpływa to na Vercel ani na przyszłe kopie w Cloudflare R2.

## Dowody

1. **Ruch użytkowników** — logi Supabase (nagłówek `Referer` żądań API), tylko odczyt:

   | Okno 24 h | Z `wawis-klima.vercel.app` | Z `*.pages.dev` | Bez strony (funkcje serwerowe, automaty) |
   |---|---|---|---|
   | 19–20.10 | 1649 | **0** | 145 |
   | 22–23.10 | 2576 | **0** | 365 |
   | 23–24.10 | 3249 | **0** | 772 |

   Wszyscy użytkownicy (administrator i pracownicy) pracują na **wawis-klima.vercel.app**. Nikt nie korzystał z aplikacji pod adresem Cloudflare.
2. **Repozytorium:**
   - nie ma konfiguracji Cloudflare (`wrangler.toml`, `_headers`, `_redirects`);
   - żaden dokument procesu wydania nie opisuje Cloudflare jako hostingu;
   - produkcja, bramki i kontrola wersji dotyczą wyłącznie Vercel (`vercel.json`, `vercel-deploy-guard.cjs`).
3. **GitHub:** aplikacja „Cloudflare Workers and Pages” buduje każdą gałąź i dodaje check „Cloudflare Pages” do PR. Ten check **nie jest wymagany** w rulesecie `main` (wymagany jest tylko `targeted-checks`). Jego wyłączenie nie zablokuje wydań.
4. **R2** (kopie zapasowe) to osobna usługa Cloudflare. Nie zależy od Pages ani od aplikacji GitHub. Wyłączenie Pages nie dotyka R2.

**Czego nie widzę (brak dostępu):** ustawień projektu Pages (zmienne środowiskowe, domeny niestandardowe). Dlatego krok 1 poniżej to sprawdzenie przed wyłączeniem.

## Kroki dla właściciela

### Krok 1. Sprawdzenie (2 minuty, niczego nie zmienia)

[dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → projekt **wawis**:

- **Custom domains:** czy jest podpięta domena (np. `app.wawis.pl`)?
  - **Brak** — przejdź do kroku 2.
  - **Jest** — zatrzymaj się i napisz do Claude'a. Domenę trzeba najpierw przenieść lub odłączyć świadomie, żeby nie przerwać jej działania.
- **Settings → Variables and Secrets:** czy są zmienne `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (dla Production i/lub Preview)? Zapisz tylko odpowiedź tak/nie, bez wartości. To potwierdzi, czy podglądy łączyły się z prawdziwą bazą.

### Krok 2. Wyłączenie automatycznych buildów (odwracalne)

W projekcie **wawis** → **Settings → Build** (lub „Builds & deployments”):

- **Branch control:**
  - **Production branch:** wyłącz „Enable automatic production branch deployments”;
  - **Preview branch:** ustaw **None** (brak podglądów).
- **Save.**

Od tej chwili push do GitHub nie tworzy nowych publicznych kopii aplikacji. To ustawienie można w każdej chwili przywrócić.

### Krok 3. Odłączenie od repozytorium GitHub (po kroku 2)

GitHub → avatar → **Settings → Applications → Installed GitHub Apps** → **Cloudflare Workers and Pages** → **Configure**:

- **Repository access:** odznacz `wawis-klima/wawis` (albo „Only select repositories” bez WAWIS).
- **Save.** Check „Cloudflare Pages” zniknie z kolejnych PR-ów.

### Krok 4. Usunięcie dotychczasowych podglądów (opcjonalnie, po tygodniu)

Gdy przez tydzień nic nie zgłosi problemu: projekt **wawis** → **Settings → Delete project**. To usuwa wszystkie stare publiczne buildy, w tym `release-v13-xx.wawis.pages.dev`.

- **Nie usuwaj** konta Cloudflare ani R2.
- **Nie zmieniaj** DNS domeny `wawis.pl`.

### Krok 5. Supabase — lista dozwolonych adresów logowania

Supabase → projekt WAWIS → **Authentication → URL Configuration**:

- **Site URL:** `https://wawis-klima.vercel.app`.
- **Redirect URLs:** usuń wpisy z `pages.dev` (jeśli są). Zostaw adresy Vercel produkcyjne.

## Zabezpieczenie w kodzie (wykonam po testach 13.70, w normalnym wydaniu)

`scripts/vercel-deploy-guard.cjs` będzie przerywać build uruchomiony w Cloudflare Pages (zmienna `CF_PAGES=1`). Nawet jeśli integracja zostanie kiedyś przypadkowo włączona, nie powstanie działająca kopia aplikacji. Test w `scripts/` sprawdzi obie sytuacje (Vercel `main` = GO, Cloudflare = NO-GO).
