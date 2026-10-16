# RELEASE RESULT

## Wersja
- 13.25 (przygotowanie — nie potwierdza wdrożenia)

## Zakres
- Desktop: poprawka pierwszego pobierania zdjęć i komentarzy po logowaniu.
- Jednorazowy retry, gdy inicjalna próba została pominięta podczas synchronizacji sesji.
- Twardy timeout nierozstrzygniętego Promise z ponowieniem i komunikatem „Ponów”.
- Test regresyjny, bez zmian Supabase, mobile i protokołów.

## Bramki
- Wymagane zielone CI PR (targeted-checks, E2E desktop, build).
- Po merge do main potwierdzenie Vercel READY i test na zalogowanym desktopie.
