# RELEASE RESULT - Wawis 9.24

## Wersja
- 9.24

## Zakres
- desktop administratora / moduł `Montaże`: po otwarciu szczegółów zlecenia lewa lista i prawy panel przewijają się niezależnie,
- lewy panel ma własny pionowy scroll oraz przechwytuje pionowe kółko myszy przed wewnętrznym kontenerem tabeli,
- wysokość split-view jest ograniczona do aktualnego viewportu przez `100dvh`, aby obszar przewijania nie wychodził pod dolną krawędź ekranu,
- prawy panel szczegółów zachowuje dotychczasowe niezależne przewijanie,
- mobile nie został zmieniony względem bazy 9.23.

## Supabase
- brak nowej migracji SQL,
- brak zmian Edge Function.

## Kontrola lokalna
- `test:smoke:desktop-jobs-split-scroll` 2x PASS,
- `test:smoke:desktop-job-details-polish` 2x PASS,
- `test:smoke:desktop-jobs-layout-width` 2x PASS,
- `test:smoke:desktop-unified-layout` 2x PASS,
- `test:smoke:desktop-only` 2x PASS,
- `test:smoke:selection` 2x PASS,
- `test:smoke:version` 2x PASS,
- `test:smoke:job-completion` 2x PASS,
- `test:smoke:mobile-new-job-sms-defaults` 2x PASS,
- porównanie z bazą 9.23 potwierdziło brak zmian w `MobileJobsLayout.jsx`.

## Build
- pełny lokalny build Vite nie został uruchomiony, ponieważ paczka release nie zawiera `node_modules`; nie deklarujemy builda jako PASS bez faktycznej kompilacji.
