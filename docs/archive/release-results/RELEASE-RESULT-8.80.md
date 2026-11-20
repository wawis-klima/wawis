# RELEASE RESULT

## Wersja
- 8.80

## Tryb
- porządkowanie testów i CI, bez zmian funkcjonalnych aplikacji

## Wygenerowano
- 2026-07-29

## Zakres
- zaktualizowano przestarzały tekst mobilnego Playwright do `Zakończone · tylko podgląd`;
- usunięto wycofany moduł `Serwisy`, stare panele 360 i dwie nieużywane migracje tego modułu;
- usunięto stary endpoint Resend `api/send-assignment-email.js`;
- usunięto osierocone testy, zdublowany alias i nieużywane grafiki;
- zachowano wartościowe kontrole kadrowania OCR przez przeniesienie ich do aktywnego testu;
- włączono do desktopowego release runnera rzeczywisty Playwright E2E oraz testy RLS, Centrum 360, dashboardu, białego ekranu tabliczek i AI/kodów;
- dodano mobilny Playwright sprawdzający trwałą kolejkę zdjęć po przeładowaniu oraz zachowanie komentarzy zakończonego zlecenia.

## Wyniki wykonane lokalnie
- kontrola składni zmienionych plików Node/Playwright: OK;
- 75 szybkich smoke testów, przebieg 1: OK;
- 75 szybkich smoke testów, przebieg 2: OK;
- `verify:release`, przebieg 1: OK;
- `verify:release`, przebieg 2: OK;
- kontrola planu `release:mobile`: testy mobilne x2, Playwright x2, build x2 i ZIP obecne;
- kontrola planu `release:desktop`: rzeczywisty desktop E2E x2 oraz wszystkie dołączone ważne testy obecne;
- kontrola brakujących celów skryptów npm: OK;
- kontrola martwych plików i nieużywanych fixture: OK.

## Kontrole wymagające środowiska CI
- `test:smoke:job-contractor-conflict` wymaga zainstalowanego `@supabase/supabase-js`;
- rzeczywiste testy Playwright wymagają `@playwright/test` i Chromium;
- produkcyjny build wymaga zależności Vite z npm.

Lokalne środowisko nie mogło zakończyć `npm ci`, ponieważ DNS nie rozwiązywał `registry.npmjs.org` (`Temporary failure in name resolution`). Nie wykryto błędu projektu; pełne kontrole zależnościowe są obowiązkowo uruchamiane przez GitHub Actions po wgraniu wersji do repozytorium.

## Kryterium publikacji
- Publikować dopiero po zielonym wyniku `Mobile release checks` i `Desktop release checks` w GitHub Actions.
- Czerwony wynik oznacza, że wersji nie należy wdrażać do produkcji.
