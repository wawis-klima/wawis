# RELEASE RESULT

## Wersja
- 11.94

## Zakres
- desktop i mobile: opcjonalne pole NIP w formularzu dodawania i edycji klienta/montażu
- NIP jest przechowywany przy kontrahencie, a nie duplikowany w tabeli montaży
- wybranie istniejącego kontrahenta wczytuje zapisany NIP do formularza
- administrator może zapisać/zmienić NIP; pracownik może uzupełnić brakujący NIP, ale nie może zastąpić istniejącego inną wartością
- Supabase: nowy ograniczony RPC `save_job_contractor_nip`, bez dostępu dla roli anonimowej
- brak integracji GUS i Fakturownia.pl w tej wersji — 11.94 przygotowuje dane pod późniejszą integrację

## Kontrola regresji
- smoke: scripts/smoke-job-nip-v1194.cjs
- migracja produkcyjna: 20260930171655 job_contractor_nip_v1194 — zastosowana
- uprawnienia RPC: authenticated=true, anon=false — zweryfikowane
- Supabase security/performance advisors — uruchomione
- WAWIS PR checks / targeted-checks: PENDING
- Vercel: PENDING
- merge: PENDING
