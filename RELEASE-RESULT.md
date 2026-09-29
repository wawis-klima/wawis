# RELEASE RESULT

## Wersja
- 11.77

## Zakres
- audyt Kontrahentów: etap 4 / K13 + K11
- bez migracji Supabase i bez zmian RLS

## K13 — desktop i współdzielony kontakt
- nowy kontrahent nadal jest blokowany przy wykrytym duplikacie
- istniejący kontrahent może zostać edytowany, gdy jedynym konfliktem jest wspólny telefon i/lub e-mail
- wspólny kontakt jest widocznym ostrzeżeniem
- konflikt nazwy oraz inne niekontaktowe pola tożsamości nadal blokują zapis
- produkcyjny trigger UPDATE dopuszcza wspólne kontakty, a unikalny indeks nazwy pozostaje aktywny

## K11 — import XLSX
- kolumna Status jest mapowana do `is_active`
- obsługiwane są m.in. Aktywny/Nieaktywny/true/false
- jeśli kolumny Status nie ma, zachowane jest kompatybilne `is_active=true`
- jeśli kolumna Status istnieje, ale wartość jest pusta/nieznana, wiersz jest błędny
- błędny lub nietablicowy `Adresy (JSON)` jest raportowany na konkretnym wierszu
- puste wiersze są odrzucane przed ustawieniem wartości domyślnych
- zachowywany jest rzeczywisty numer wiersza XLSX

## Kontrola regresji
- `scripts/smoke-contractors-stage4-v1177.mjs`
- smoke obejmuje status, błędny JSON, numer wiersza i regułę K13
- `tests/e2e/contractor-xlsx-import-v1177.spec.js` wykonuje rzeczywisty round-trip XLSX w Chromium dla desktopu i mobile
- WAWIS PR checks: PENDING
- Playwright desktop/mobile: PENDING
- produkcyjny build: PENDING
- Vercel: PENDING
- merge: PENDING
