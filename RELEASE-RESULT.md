# RELEASE RESULT

## Wersja
- 10.81

## Proces
- jedna obowiązkowa bramka: `WAWIS PR checks / targeted-checks`
- po zielonym PR: merge do `main` i jeden produkcyjny Vercel
- Google Drive / ZIP / osobny final runner / blokujący post-deploy: niewymagane

## Zakres
- wymuszone przeładowanie po zmianie wersji i `controllerchange` przechodzi przez wspólny reload guard
- otwarty `AppModal` na mobile i desktop blokuje automatyczny reload
- protokół/podpis klienta oraz formularze montażu są chronione, bo korzystają ze wspólnego `AppModal`
- po zamknięciu ostatniego modala odroczona aktualizacja wykonuje dokładnie jeden reload
- aktywna praca instaluje dodatkową ochronę `beforeunload` tam, gdzie runtime ją obsługuje
