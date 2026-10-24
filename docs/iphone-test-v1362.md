# WAWIS 13.62 — test na fizycznym iPhonie (Safari / WebKit)

Testy automatyczne 13.62 działają w Chromium. Nie dowodzą zachowania Safari. Ten test wykonuje się
osobno na prawdziwym iPhonie, po zielonym CI i po wdrożeniu zatwierdzonym przez właściciela.

**Zasada:** zielony komunikat w aplikacji nie jest dowodem. Dowodem jest plik w Storage o rozmiarze
większym niż 0 B oraz rekord w tabeli `photos`, potwierdzone zapytaniem SELECT.

## Przygotowanie

- Telefon testowy: najlepiej iPhone Pawła albo Kacpra (lokalna baza zdjęć v4). Jeśli niedostępny —
  dowolny iPhone, który 22.10 uruchomił WAWIS w wersji 13.42–13.48.
- Montaż testowy (nie klienta), np. „TEST 13.62 iPhone”.
- **Nie usuwać aplikacji z ekranu początkowego** i nie czyścić danych Safari przed testem —
  właśnie stara baza v4 jest przedmiotem testu.
- Zanotować godzinę rozpoczęcia (czas lokalny i UTC).

## A. Aktualizacja i odczyt kolejki (PWA z ekranu początkowego)

1. Otworzyć WAWIS z ekranu początkowego, zalogować się, sprawdzić stopkę/diagnostykę: **13.62**.
2. Otworzyć Synchronizację pracownika.
   - Oczekiwane: brak banera „Kolejka zdjęć niedostępna”; liczba oczekujących zdjęć zgodna z
     rzeczywistością (może być > 0 — stare zdjęcia z 22.10 zaczną się wysyłać).
   - Jeśli baner jest widoczny: zrobić zrzut ekranu z kodem (PHOTO_QUEUE_…), przejść do sekcji D.

## B. Tabliczki online (scenariusz Pawła)

1. Online (Wi‑Fi lub LTE). Montaż testowy → Edytuj → dodać urządzenie → 2 zdjęcia tabliczek
   (jednostka wewnętrzna i zewnętrzna) aparatem → Zapisz.
2. Oczekiwane: brak komunikatu „Nie wszystkie tabliczki zostały potwierdzone na serwerze…”,
   okno zamyka się po potwierdzeniu.
3. Weryfikacja na serwerze (SELECT, tylko odczyt):

```sql
select p.id, p.job_id, p.unit_ref, p.storage_path, p.created_at,
       (o.metadata->>'size')::bigint as bytes
from photos p
left join storage.objects o
  on o.bucket_id = 'job-photos' and o.name = p.storage_path
where p.job_id = '<ID montażu testowego>'
  and p.created_at > '<godzina startu UTC>'
order by p.created_at;
```

   - Oczekiwane: 2 wiersze, `bytes > 0` w obu.

## C. Zwykłe zdjęcie offline → online (scenariusz Kacpra)

1. Włączyć tryb samolotowy. Dodać 1 zdjęcie dokumentacji do montażu testowego.
   - Oczekiwane: „Zapisano na telefonie” (tylko po zapisie w IndexedDB).
2. Zamknąć aplikację całkowicie (przesunięcie w górę), otworzyć ponownie — zdjęcie nadal w
   Synchronizacji jako oczekujące.
3. Wyłączyć tryb samolotowy. Odczekać do zniknięcia z kolejki.
4. Powtórzyć SELECT z punktu B — 1 nowy wiersz, `bytes > 0`.

## D. „Napraw kolejkę zdjęć” (tylko gdy A pokazało błąd lub na telefonie testowym)

1. Synchronizacja → „Napraw kolejkę zdjęć”. Pierwsze okno podaje liczbę niewysłanych zdjęć.
   Najpierw **Anuluj** — kolejka bez zmian.
2. Ponownie → potwierdzić oba okna. Oczekiwane: „Lokalna kolejka zdjęć została wyczyszczona i
   założona od nowa”, odświeżenie, **nadal zalogowany**, montaże i protokoły widoczne.
3. Jeśli pojawi się „Naprawa kolejki NIE powiodła się” — zamknąć wszystkie inne karty/okna WAWIS
   (także Safari) i powtórzyć. Zrobić zrzut ekranu.
4. Po naprawie powtórzyć B.

## E. Safari (bez PWA)

Powtórzyć A i B w Safari (nie z ekranu początkowego). Safari i PWA mają osobne magazyny danych,
więc wynik może się różnić.

## Kryteria zaliczenia

| Punkt | Wynik | Dowód |
|---|---|---|
| A wersja 13.62, brak banera błędu | | zrzut |
| B 2 tabliczki, bytes > 0 | | wynik SELECT |
| C offline → online, bytes > 0 | | wynik SELECT |
| D anulowanie nic nie usuwa, naprawa zachowuje sesję | | zrzuty |
| E Safari | | zrzut + SELECT |

---

## Osobna diagnoza: HTTP 400 „No content provided” (0 B) z iOS — WAWIS-1346

**Nie jest naprawiana w 13.62** (zgodnie z poleceniem: bez dużej przebudowy transportu).

- Dowody: logi Storage 22.10 ok. 14:50 UTC i 23.10 ok. 11:40 UTC — żądania z iPhone'a w wersji
  13.61 (= kod 13.38) kończą się HTTP 400 z pustą treścią multipart; kolejne ponowienia tego samego
  zdjęcia kończą się 200. Problem nie jest więc skutkiem rollbacku i nie jest przyczyną błędów
  Pawła i Kacpra (u nich nie było żadnego POST do Storage).
- Hipoteza (pewność średnia): WebKit wysyła `FormData` z `Blob`/`File` pochodzącym z aparatu lub
  odczytanym z IndexedDB, którego dane nie są jeszcze dostępne (plik zwolniony/odroczony) —
  znany problem Safari z Blobami z IndexedDB i z `<input type=file>` po wybudzeniu aplikacji.
- Propozycja na osobną wersję (wymaga osobnej zgody):
  1. Przed wysyłką odczytać zdjęcie do `ArrayBuffer`, sprawdzić `byteLength > 0` i wysyłać
     `new Blob([buffer], { type })` zamiast oryginalnego obiektu.
  2. `byteLength === 0` → nie wysyłać; status „Plik zdjęcia jest pusty — dodaj ponownie” zamiast
     cichego błędu.
  3. Odpowiedź 400 z treścią „No content provided” traktować jako błąd przejściowy (ponowienie),
     a nie trwały.
  4. Test na fizycznym iPhonie analogiczny do punktu B/C z porównaniem rozmiaru pliku.
