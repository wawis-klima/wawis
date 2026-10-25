# Test WAWIS 13.70 na iPhonie — poniedziałek 26.10.2026

**Kto:** najpierw Paweł, potem Kacper. Każdy na swoim telefonie i swoim koncie.
**Czas:** ok. 15 minut na osobę.
**Gdzie:** na prawdziwym montażu, przy którym i tak trzeba dodać zdjęcia i tabliczki (nie tworzymy montaży testowych).
**Zasada:** jeśli coś nie działa — zrób zrzut ekranu, zapisz godzinę i napisz do Claude'a. Nie próbuj naprawiać na siłę.

---

## Krok 0. Przygotowanie (z internetem)

1. Otwórz WAWIS z ekranu głównego telefonu. Aplikacja może raz sama się przeładować — to aktualizacja.
2. Menu → **Diagnostyka**. W prawym górnym rogu musi być **v13.70**.
   - Jeśli jest starsza: zamknij aplikację całkowicie (przesuń w górę z przełącznika aplikacji) i otwórz ponownie.
3. Odczekaj 20 sekund na tym ekranie. W sekcji **„Odczyt tabliczek bez internetu”** oba czytniki powinny mieć **„zapisany w telefonie”**.
   - Jeśli nie: naciśnij **„Pobierz czytniki teraz”** i odczekaj.
4. Jeśli pojawi się żółty baner o **starych zdjęciach z telefonu** — naciśnij **„Usuń stare zdjęcia”**. Nie odzyskujemy ich.

✅ / ❌ Wersja 13.70 ✅ / ❌ Oba czytniki zapisane

---

## Krok 1. Zdjęcie z internetem

1. Otwórz montaż → dodaj **1 zdjęcie** (aparat lub galeria).
2. Zdjęcie ma pojawić się w montażu bez czerwonych komunikatów.
3. Zamknij i otwórz montaż ponownie — zdjęcie nadal widoczne (miniatura, nie szary kwadrat).

✅ / ❌

---

## Krok 2. Tryb samolotowy — zdjęcie

1. Włącz **tryb samolotowy** (i wyłącz Wi-Fi, jeśli się włączyło).
2. Spróbuj dodać zdjęcie.
3. Ma się pojawić komunikat, że **bez internetu zdjęć nie można dodać**. Aplikacja nie może się zawiesić.

✅ / ❌

---

## Krok 3. Tryb samolotowy — tabliczka

Nadal w trybie samolotowym:

1. Montaż → **Tabliczki** (lub **Urządzenia**) → zrób zdjęcie tabliczki jednostki.
2. Po odczycie: pola **Model** i **Numer seryjny** wypełnione, żółte ostrzeżenie **„Brak internetu — AI nie sprawdziła tabliczki”**.
3. Porównaj numer z tabliczką. **„Potwierdź”** działa dopiero po zaznaczeniu **„Sprawdziłem numer SN znak po znaku”**.
4. Naciśnij **„Zapisz”** → okno **„Brak internetu”** → **„Zamknij okno”**. Aplikacja wraca do montażu.

✅ / ❌ Numer SN wpisany ✅ / ❌ Okno „Brak internetu” ✅ / ❌ Powrót do montażu

---

## Krok 4. Tryb samolotowy — praca bez internetu

1. Zmień **status** dowolnego montażu lub dodaj **komentarz**.
2. **Zamknij aplikację całkowicie** i otwórz ją ponownie (nadal w trybie samolotowym).
3. Otwórz kilka montaży i ich szczegóły.

Zapisz, co się otworzyło, a co nie — ta informacja jest ważna dla kolejnej poprawki.

✅ / ❌ Status/komentarz przyjęty ✅ / ❌ Montaże otwierają się po ponownym uruchomieniu

---

## Krok 5. Powrót internetu

1. Wyłącz tryb samolotowy, poczekaj 30 sekund.
2. Status / komentarz z kroku 4 jest widoczny (także na komputerze administratora).
3. Otwórz ponownie **Tabliczki** w montażu z kroku 3 → dane wracają z informacją **„Przywrócono niezapisane dane”** → **„Zapisz”**.
4. Tabliczka zapisana, zdjęcie tabliczki widoczne.

✅ / ❌

---

## Po teście

Napisz do Claude'a: „Paweł skończył” / „Kacper skończył” + które kroki ❌ (ze zrzutami).
Claude sprawdzi w bazie (tylko odczyt), że nowe zdjęcia mają prawidłowy rozmiar, a telefon zgłasza wersję 13.70 bez błędów.

**Jeśli aplikacja w ogóle nie działa** (nie otwiera się, pętla przeładowań, nie da się zalogować): natychmiast napisz — przygotowana jest procedura powrotu do poprzedniej wersji (`docs/WAWIS-PLAN-NAPRAWCZY.md`, sekcja 8).
