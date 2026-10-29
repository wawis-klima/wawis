# RELEASE RESULT — WAWIS 13.94
## Zakres
- Podpis serwisu kadrowany do śladu analogicznie jak podpis montażowy; pusty podpis blokuje akceptację.
- PUSH: weryfikacja kontekstu użytkownika i generacji SW oraz ponowna synchronizacja aktywnej subskrypcji istniejącym API WAWIS; ostrzeżenie jeśli lokalny telefon nie potwierdza gotowości.
- Administrator: kosz i przywracanie serwisu wszystkich statusów, również wykonanego; podpisane PDF i zdjęcia pozostają zapisane.
## Odbiór
- GitHub PR checks, Playwright/WebKit, Closure Gate i smoke.
- Migracja RPC admin + audyt kosza, Vercel READY i app-version=13.94.
- Test fizycznego iPhone: podpis musi być widoczny; PUSH wymaga potwierdzenia displayed_at.
## Historia
Nie modyfikujemy historycznych podpisanych PDF-ów ani ponownie nie wysyłamy starych zdarzeń PUSH.
