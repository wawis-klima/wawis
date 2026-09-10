# RELEASE RESULT

## Wersja
- 8.81

## Tryb
- funkcjonalny: wiele adresów jednego klienta

## Wygenerowano
- 2026-07-30

## Zakres
- jeden kontrahent może mieć wiele nazwanych adresów z miastem, ulicą, notatką i oznaczeniem adresu głównego;
- karta kontrahenta pozwala dodawać, edytować, usuwać i wybierać adres główny;
- formularz montażu pozwala wybrać istniejący adres klienta albo dopisać nową lokalizację bez tworzenia drugiego klienta;
- każde zlecenie zapisuje `contractor_address_id` oraz własny historyczny snapshot `city/street/location`;
- późniejsza edycja kartoteki klienta nie zmienia adresów zapisanych na starych montażach;
- eksport/import XLSX zachowuje pełną listę adresów w kolumnie `Adresy (JSON)`;
- globalne wyszukiwanie desktopowe obejmuje wszystkie adresy klienta, nazwy lokalizacji i notatki;
- aplikacja mobilna pracownika nadal pokazuje tylko jeden adres przypisany do konkretnego zlecenia;
- dodano migrację `contractor-addresses-v8.81.sql` oraz test `test:smoke:contractor-addresses`.

## Wyniki wykonane lokalnie
- 76 testów smoke, przebieg 1: OK;
- 76 testów smoke, przebieg 2: OK;
- `test:smoke:contractor-addresses`: OK;
- `test:smoke:desktop-global-search`: OK, włącznie z dodatkowym adresem i notatką lokalizacji;
- `test:smoke:job-auto-contractor`: OK;
- `test:smoke:job-contractor-link`: OK;
- kontrola składni 185 plików źródłowych JS/JSX przez TypeScript: OK;
- kontrola składni wszystkich skryptów CJS: OK;
- plan `release:mobile:dry-run`: nowy test, Playwright, verify, build i ZIP obecne po dwa razy;
- plan `release:desktop:dry-run`: nowy test, Playwright, verify, build i ZIP obecne po dwa razy;
- `verify:release`, przebieg 1: OK;
- `verify:release`, przebieg 2: OK.

## Kontrole wymagające środowiska CI
- `test:smoke:job-contractor-conflict` importuje `@supabase/supabase-js` i uruchomi się po `npm ci` w GitHub Actions;
- rzeczywiste testy Playwright wymagają `@playwright/test` i Chromium;
- produkcyjny build wymaga zależności Vite z npm.

Próba połączenia z `https://registry.npmjs.org/` zatrzymała się na limicie czasu już podczas `npm ping`, dlatego w tym środowisku nie utworzono katalogu `dist`. Nie jest to błąd wykryty w kodzie aplikacji. Pełne testy zależnościowe, Playwright i dwa buildy są obowiązkowo wykonywane przez workflow GitHub Actions.

## Wdrożenie
1. Najpierw uruchomić w Supabase SQL Editor cały plik `contractor-addresses-v8.81.sql`.
2. Dopiero po poprawnym wykonaniu migracji wdrożyć aplikację 8.81.
3. Opublikować wersję dopiero po zielonym wyniku workflow mobile i desktop.
4. Ręcznie sprawdzić: drugi adres na karcie klienta, wybór drugiego adresu w nowym montażu oraz niezmienność adresu starego zlecenia po edycji kartoteki.

## Kryterium publikacji
- Zielony wynik obu workflow GitHub Actions: publikacja dozwolona.
- Czerwony wynik któregokolwiek workflow: wersji nie publikować; sprawdzić raport i artefakty testów.
