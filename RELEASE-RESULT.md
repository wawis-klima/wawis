# RELEASE RESULT

## Wersja
- 11.71

## Zakres
- pierwszy protokół dla historycznego zakończonego montażu bez `installer_ids`
- odtworzenie monterów z dawnego `main_technician_id + viewers` tylko na potrzeby PDF
- brak automatycznego zapisu fallbacku do `jobs.installer_ids`
- usunięcie blokady podpisu i zapisu pierwszego protokołu
- bez zmian w Supabase, RLS, Storage i Edge Functions

## Kontrola regresji
- smoke wymaga fallbacku `getLegacyInstallerSuggestionIds` dla braku `installer_ids`
- smoke zabrania powrotu komunikatu „Monterzy wymagają potwierdzenia”
- smoke zabrania blokady pierwszego podpisu i zapisu z powodu braku `installer_ids`
- istniejące testy nadal pilnują ponownego podpisu, druku i zapisu protokołu

## Wynik wydania
- WAWIS PR checks: PENDING
- produkcyjny build: PENDING
- Vercel: PENDING
- merge: PENDING
