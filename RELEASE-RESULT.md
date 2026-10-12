# RELEASE RESULT

## Wersja
- 13.20

## Zakres
- Desktopowe Montaże: ukrycie kodów pocztowych wyłącznie w widokach W trakcie, Niezrealizowane i Zakończone.
- Miejscowość, ulica i numer domu pozostają; brak zmian danych, formularzy, faktur, PDF, mobile oraz tabeli Nowe.
- Trwały regresyjny test formattera w `scripts/smoke-desktop-jobs-layout-width.cjs`.

## Bramki
- Przed merge: zielony PR checks / targeted-checks i Closure Gate z E2E oraz buildem.
- Po merge: Vercel READY właściwego commita, porównanie wersji 13.20.
- Manualny odbiór rzeczywistych adresów w desktopie: trzy statusy bez kodu pocztowego, Nowe niezmienione.
