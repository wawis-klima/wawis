# RELEASE RESULT

## Wersja
- 12.02

## Zakres
- desktop: usunięta sekcja „Instalatorzy (opcjonalnie)” z formularza montażu
- desktop: nowy formularz bardziej kompaktowy, aby mieścił się bez przewijania przy typowym rozmiarze okna
- desktop: zmniejszone wysokości pól, odstępy i pole komentarza administratora
- mobile: bez zmian

## Kontrola regresji
- smoke: scripts/smoke-desktop-job-form-compact-v1202.cjs
- istniejące testy formularza, NIP i kodu pocztowego pozostają aktywne
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
