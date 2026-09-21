# WAWIS v9.87 — firmowa wysyłka protokołów

Wersja 9.87 wysyła podpisany protokół wyłącznie przez zabezpieczoną Edge Function. Telefon pracownika nie otwiera Outlooka ani prywatnej skrzynki. Nadawcą jest zawsze `WAWIS Klimatyzacja <biuro@wawis.pl>`.

## Jednorazowa konfiguracja

1. Jeżeli nie zostały jeszcze uruchomione, wykonaj w Supabase SQL Editor kolejno:
   - `supabase/setup-job-protocols-v9.79.sql`
   - `supabase/setup-job-payment-confirmation-v9.86.sql`
   - `supabase/setup-job-protocol-email-v9.87.sql`
2. W Resend dodaj i zweryfikuj domenę `wawis.pl`, a następnie utwórz klucz API przeznaczony do wysyłki protokołów.
3. W Supabase otwórz `Edge Functions → Secrets` i dodaj sekret:
   - nazwa: `RESEND_API_KEY`
   - wartość: klucz utworzony w Resend
4. Wdróż funkcję z katalogu `supabase/functions/send-job-protocol-email` z włączoną weryfikacją JWT.

## Wdrożenie funkcji poleceniami

Po zalogowaniu Supabase CLI i połączeniu projektu:

```powershell
supabase secrets set RESEND_API_KEY=TU_WKLEJ_KLUCZ
supabase functions deploy send-job-protocol-email
```

Klucza API nie wolno wpisywać do kodu aplikacji, pliku `.env` dodawanego do ZIP ani do Vercel. Sekret ma znajdować się wyłącznie w ustawieniach Edge Functions Supabase.

## Zasady bezpieczeństwa

- funkcję może wywołać tylko zalogowany użytkownik aplikacji;
- użytkownik musi mieć dostęp do wskazanego zlecenia;
- zlecenie musi być zakończone i mieć podpisany protokół;
- odbiorcą może być wyłącznie adres zapisany w polu e-mail tego zlecenia;
- prywatny PDF pobiera i dołącza serwer, a nie program pocztowy pracownika;
- każda próba i jej wynik są zapisywane w `job_protocol_email_log`;
- ponowna wysyłka w ciągu 30 sekund jest blokowana.
