# RELEASE RESULT

## Wersja
- 12.17

## Zakres
- SMS: jeden klient z kilkoma aktywnymi urządzeniami dostaje jeden wpis i jeden SMS w 62-dniowym oknie serwisowym
- grupowanie działa także wtedy, gdy urządzenia mają różne daty montażu, różne terminy przypomnienia i różne numery cyklu
- jedna wysłana/doręczona wiadomość blokuje kolejne bliskie przypomnienia tego samego klienta
- widok „Wysłane w tym miesiącu” oraz pełna historia są grupowane po kliencie i oknie serwisowym
- cleanup usuwa tylko techniczne duplikaty oczekujące/anulowane/błędne/niewysłane; zachowuje faktyczną historię sent/provider_sent/delivered
- aktualizacja Edge Function generate-service-sms-queue
- nowa migracja Supabase: 20261002070000_sms_customer_window_dedup_v1217.sql
- desktop i mobile zachowują tę samą logikę

## Kontrola regresji
- smoke sms-job-grouping rozszerzony o dwa urządzenia jednego klienta z terminami oddalonymi o kilkanaście dni i różnymi cyklami
- smoke sms-log-cleanup rozszerzony o 62-dniowe okno oraz ochronę historii skutecznych wysyłek
- WAWIS PR checks / targeted-checks: PENDING (po ostatnich zmianach ACL)
- migracja Supabase: APPLIED (`sms_customer_window_dedup_v1217` + `sms_cleanup_rpc_acl_v1217`)
- Edge Function: DEPLOYED — `generate-service-sms-queue` v17 ACTIVE
- Security Advisor: CHECKED — cleanup RPC bez dostępu anon; pozostałe ostrzeżenia są wcześniejsze i niezwiązane z 12.17
- Performance Advisor: CHECKED — brak nowych tabel/indeksów; pozostałe informacje są wcześniejsze
- Vercel: PENDING
- merge: PENDING
