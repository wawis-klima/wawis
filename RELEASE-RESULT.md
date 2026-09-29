# RELEASE RESULT

## Wersja
- 11.84

## Zakres
- desktop: status Faktura VAT w tabeli Montaże i w sekcji Klient
- Supabase: nowa kolumna `jobs.vat_invoice_issued` oraz admin-only RPC
- mobile: bez zmian funkcjonalnych i bez pola FV w mobilnym payloadzie

## Zachowanie startowe
- 10 najnowszych zakończonych montaży według `installation_date DESC, created_at DESC` pozostaje z `vat_invoice_issued=false` do ręcznego potwierdzenia
- wszystkie wcześniejsze zakończone montaże są jednorazowo ustawiane na `vat_invoice_issued=true`
- nowe montaże startują jako niewystawiona faktura VAT

## Desktop
- tabela Montaże: kolumna `FV` pomiędzy Tabliczki i Data montażu
- czerwone kółko = faktura niewystawiona
- zielone kółko = faktura wystawiona
- sekcja Klient: klikany status `Niewystawiona / Wystawiona`
- zapis aktualizuje listę i otwarty montaż bez pełnego przeładowania

## Bezpieczeństwo
- zmiana statusu z UI używa `admin_set_job_vat_invoice_issued`
- RPC wymaga `current_user_is_admin()`
- brak zmian istniejących polityk RLS
- mobile nie pobiera nowej kolumny

## Kontrola regresji
- `scripts/smoke-desktop-vat-invoice-v1184.cjs`
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
