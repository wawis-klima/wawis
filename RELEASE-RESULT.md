# RELEASE RESULT

## Wersja
- 10.84

## Proces
- jedna obowiązkowa bramka: `WAWIS PR checks / targeted-checks`
- po zielonym PR: merge do `main` i jeden produkcyjny Vercel
- Google Drive / ZIP / osobny final runner / blokujący post-deploy: niewymagane

## Zakres
- F5: spóźnione loadery szczegółów, zdjęć i miniaturek nie mogą już zapisać danych po zmianie sesji lub kontekstu
- F7: fallback polling odświeża także otwarte szczegóły montażu, więc zgubiony event Realtime nie pozostawia starego komentarza ani zdjęcia na ekranie
- F8: pełne i przyrostowe odświeżenia mają wspólną ochronę kolejności; starsza odpowiedź nie nadpisuje nowszego stanu, również po asynchronicznej hydracji cache mobile
- F9: aktualizacja kursora synchronizacji IndexedDB jest atomowa i nie może przywrócić starszego snapshotu po nowszym zapisie
- dodatkowo: aktualizacja lokalnej kolejki zdjęć jest atomowa, więc równoległy restore/resume nie może wskrzesić rekordu usuniętego po uzgodnieniu tabliczki z serwerem
- dodano dedykowane regresje Node i rzeczywiste testy Playwright dla wyścigów requestów, kursora IndexedDB i kolejki zdjęć; scenariusz uzgodnienia tabliczki został powtórzony trzykrotnie przed pełnym E2E
