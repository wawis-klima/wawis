# WAWIS 13.62 — test na fizycznym iPhonie (Safari / WebKit)

Testy automatyczne 13.62 działają w Chromium. Nie dowodzą zachowania Safari. Etap 1 wykonuje się przed
wdrożeniem na stronie testowej, etap 2 dopiero po zielonym CI i wdrożeniu zatwierdzonym przez właściciela.

**Zasada:** zielony komunikat w aplikacji nie jest dowodem. Dowodem jest plik w Storage o rozmiarze
większym niż 0 B oraz rekord w tabeli `photos`, potwierdzone zapytaniem SELECT.

## Etap 1 — przed wdrożeniem: test na stronie testowej (bez produkcji)

Strona „WAWIS 13.62 iPhone Lab” (prywatny artefakt Claude) uruchamia prawdziwe moduły kolejki zdjęć z wersji
13.48, 13.61 i 13.62 pod jednym adresem, czyli we wspólnym magazynie IndexedDB Safari. Baza v4 jest tworzona
przez kod 13.48, a potem otwierana przez 13.61 i 13.62. Zamiast Supabase działa serwer testowy w pamięci
strony, który mierzy rozmiar każdego odebranego pliku. Aplikacja WAWIS na telefonie nie jest zmieniana.

Kroki na stronie: 0 czysty start → 1 zdjęcie aparatem jako 13.48 (baza v4) → 2 uruchomienie 13.61 (błąd
odtworzony) → 3 uruchomienie 13.62 (zdjęcie widoczne i wstrzymane, 0 wysłanych automatycznie) → 4 nowe
zdjęcie online (rozmiar > 0 B) → 5 zdjęcie offline, odświeżenie strony, wznowienie → 6 decyzja: wyślij /
usuń / napraw (z potwierdzeniem). Na koniec „Kopiuj protokół” i wklejenie wyniku do rozmowy.

Ograniczenia: strona działa w Safari / widoku Claude, nie jako PWA z ekranu początkowego, i nie testuje
interfejsu WAWIS (testują go E2E w CI na dev i na zbudowanej aplikacji).

## Etap 2 — po wdrożeniu (wyłącznie po zgodzie właściciela): telefon z bazą v4

- Telefon: Pawła albo Kacpra (baza v4). **Nie usuwać aplikacji z ekranu początkowego** i nie czyścić danych
  Safari — właśnie stara baza jest przedmiotem testu.
- Montaż testowy (nie klienta), np. „TEST 13.62 iPhone”. Zanotować godzinę startu (UTC).

### A. Aktualizacja i stare zdjęcia

1. Zamknąć WAWIS całkowicie, otworzyć z ekranu początkowego, sprawdzić wersję **13.62**.
2. Jeśli na telefonie są stare zdjęcia z 22.10: wskaźnik pokazuje „N stare zdjęcia czekają na decyzję”.
   Nic nie wysyła się samo.
3. Synchronizacja → baner „Na telefonie są stare, niewysłane zdjęcia z 22.10”.
   - Kacper: zdjęcia dodał już administrator → **„Usuń stare zdjęcia”** (potwierdzić).
   - Paweł: najpierw sprawdzić zapytaniem z punktu B, czy zdjęcia tych montaży są na serwerze;
     jeśli brakuje — „Wyślij stare zdjęcia”, jeśli są — „Usuń stare zdjęcia”.
4. Jeśli zamiast tego widać „Kolejka zdjęć niedostępna”: zamknąć inne okna WAWIS (także Safari) i użyć
   „Napraw kolejkę zdjęć”.

### B. Tabliczki online (scenariusz Pawła)

1. Online. Montaż testowy → Edytuj → urządzenie → 2 zdjęcia tabliczek aparatem → Zapisz.
2. Brak komunikatu „Nie wszystkie tabliczki zostały potwierdzone…”, okno zamyka się po potwierdzeniu.
3. Weryfikacja (SELECT, tylko odczyt):

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

   Oczekiwane: 2 wiersze, `bytes > 0`.

### C. Zwykłe zdjęcie offline → online (scenariusz Kacpra)

1. Tryb samolotowy → 1 zdjęcie → „Zapisano na telefonie”.
2. Zamknąć aplikację całkowicie, otworzyć — zdjęcie nadal w Synchronizacji.
3. Wyłączyć tryb samolotowy, poczekać → SELECT z punktu B: 1 nowy wiersz, `bytes > 0`.

### D. Safari (bez PWA)

Powtórzyć B w Safari. Safari i PWA mają osobne magazyny danych.

## Kryteria zaliczenia

| Punkt | Wynik | Dowód |
|---|---|---|
| Etap 1 strona testowa: kroki 1–6 ZALICZONE | | protokół ze strony |
| A wersja 13.62, stare zdjęcia nie wysłały się same, decyzja wykonana | | zrzuty |
| B 2 tabliczki, bytes > 0 | | wynik SELECT |
| C offline → online, bytes > 0 | | wynik SELECT |
| D Safari | | zrzut + SELECT |

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
