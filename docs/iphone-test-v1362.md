# WAWIS 13.62 — test na fizycznym iPhonie (Safari / WebKit)

Testy automatyczne 13.62 działają w Chromium. Nie dowodzą zachowania Safari. Etap 1 wykonuje się przed
wdrożeniem na stronie testowej, etap 2 dopiero po zielonym CI i wdrożeniu zatwierdzonym przez właściciela.

**Zasada:** zielony komunikat w aplikacji nie jest dowodem. Dowodem jest plik w Storage o rozmiarze
większym niż 0 B oraz rekord w tabeli `photos`, potwierdzone zapytaniem SELECT.

## Etap 1 — przed wdrożeniem (opcjonalny): test na stronie testowej (bez produkcji)

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

## Etap 2 — po kontrolowanym wdrożeniu (wyłącznie po zgodzie właściciela)

Decyzja właściciela (25.10.2026): starych, niewysłanych zdjęć z telefonów Pawła i Kacpra **nie odzyskujemy**.
Testujemy wyłącznie działanie nowych zdjęć. Dane w produkcyjnym Supabase pozostają nietknięte.

Przygotowanie: montaż testowy (nie klienta) z urządzeniem JW + JZ, np. „TEST 13.62 iPhone”, status „W trakcie”.
Zanotować godzinę startu (UTC). Nie usuwać aplikacji z ekranu początkowego.

### A. Start 13.62 i czysta kolejka (Paweł, Kacper)

1. Zamknąć WAWIS całkowicie, otworzyć z ekranu początkowego, sprawdzić wersję **13.62**.
2. Jeśli wskaźnik pokazuje „N stare zdjęcia czekają na decyzję”: Synchronizacja → **„Usuń stare zdjęcia”** →
   potwierdzić. Aplikacja odświeża się, użytkownik pozostaje zalogowany, montaże są widoczne.
3. Jeśli zamiast tego widać „Kolejka zdjęć niedostępna”: zamknąć inne okna WAWIS (także Safari) →
   Synchronizacja → **„Napraw kolejkę zdjęć”** → potwierdzić.
4. Synchronizacja pokazuje „Wszystko wysłane”.

### B. Tabliczki online (przypadek Pawła)

1. Online. Montaż testowy → Edytuj → urządzenie → zdjęcia tabliczek JW i JZ aparatem → Zapisz.
2. Brak komunikatu „Nie wszystkie tabliczki zostały potwierdzone…”, okno zamyka się po zapisie.
3. Przycisk protokołu jest aktywny (komplet tabliczek na serwerze).

### C. Zdjęcia offline, zamknięcie aplikacji, powrót internetu (bez wylogowania)

1. Tryb samolotowy → zwykłe zdjęcie montażu + tabliczka nowego urządzenia → status „Zapisano na telefonie”.
   Protokół jest nieaktywny (tabliczka jeszcze nie na serwerze).
2. Zamknąć aplikację całkowicie i otworzyć ponownie (nadal tryb samolotowy) — zdjęcia nadal w Synchronizacji.
3. Wyłączyć tryb samolotowy i **nie wylogowywać się**. W ciągu ok. 1 minuty zdjęcia znikają z Synchronizacji,
   a przycisk protokołu staje się aktywny.

### D. Weryfikacja na serwerze (SELECT, tylko odczyt — wykonuje Claude)

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

Oczekiwane: każde zdjęcie z punktów B i C dokładnie raz, `bytes > 0`, brak zdjęć z 22.10.

### E. Pozostali pracownicy

Michał i Krystian (baza v3): po aktualizacji jedno zdjęcie online — bez żadnych komunikatów o kolejce.

## Kryteria zaliczenia

| Punkt | Wynik | Dowód |
|---|---|---|
| Etap 1 (opcjonalny przed wdrożeniem) strona testowa: kroki 1–6 ZALICZONE | | protokół ze strony |
| A 13.62, czysta kolejka, sesja zachowana | | zrzut |
| B 2 tabliczki online, protokół aktywny | | zrzut + SELECT |
| C offline → zamknięcie → online bez wylogowania, protokół aktywny | | zrzut + SELECT |
| E Michał / Krystian: zdjęcie online | | SELECT |

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
