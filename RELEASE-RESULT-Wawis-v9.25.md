# RELEASE RESULT - Wawis 9.25

## Wersja
- 9.25

## Zakres
- desktopowy formularz `Nowy montaż / zlecenie` oraz edycja istniejącego zlecenia: przy polu `Komentarz administratora` dodano mikrofon po prawej stronie,
- mikrofon korzysta z istniejącego `VoiceNoteButton` i kontrolowanej sesji `Nagrywanie komentarza`,
- użytkownik kończy dyktowanie przyciskiem `Zakończ nagrywanie`,
- rozpoznany tekst jest zapisywany bezpośrednio do `jobForm.admin_note`,
- Chrome/Edge są wskazywane jako obsługiwane przeglądarki desktopowe; brak obsługi jest komunikowany bez fallbacku płatnego AI,
- działający mobilny formularz komentarza nie został przebudowany.

## Supabase
- brak nowej migracji SQL,
- brak zmian Edge Function,
- brak zmian RLS.

## Kontrola lokalna
- `test:smoke:desktop-admin-note-voice` 2x PASS,
- `test:smoke:client-voice` 2x PASS,
- `test:smoke:desktop-new-job-compact` 2x PASS,
- `test:smoke:mobile-new-job-comment` 2x PASS,
- `test:smoke:version` 2x PASS,
- `verify:release` 2x PASS.

## Build
- paczka bazowa release nie zawiera `node_modules`, dlatego lokalny Vite build nie został uruchomiony; nie deklarujemy pełnego builda jako PASS bez faktycznej kompilacji.
