# RELEASE RESULT

## Wersja
- 11.47

## Zakres
- ponowne podpisanie protokołu zakończonego montażu przez innego pracownika
- spójne uprawnienia RLS dla Storage i job_protocols
- bez zmian w treści PDF

## Dowód błędu
- Storage API zwracał 403 RLS przy ponownym zapisie protokołu przez pracownika innego niż autor zakończenia
- dokładny przypadek został potwierdzony w logach produkcyjnych

## Naprawa
- current_user_can_finalize_job wymaga członka zespołu i statusu Zakończone
- UPDATE job_protocols pozwala zastąpić istniejący protokół pracownikowi zespołu
- nowa wersja protokołu zapisuje created_by aktualnego użytkownika
- migracja produkcyjna została zastosowana i zweryfikowana

## Wynik wydania
- WAWIS PR checks: PENDING
- produkcyjny build: PENDING
- Vercel: PENDING
- Cloudflare: PENDING
- merge: PENDING
