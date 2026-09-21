# RELEASE RESULT - Wawis 9.07

## Wersja
- 9.07

## Tryb
- mobile + desktop — głosowe wprowadzanie danych klienta bez płatnego fallbacku API.

## Zakres
- usunięto fallback `MediaRecorder` używany w 9.06 dla Firefox i przeglądarek bez Web Speech,
- usunięto endpoint `api/transcribe-client-voice.js`,
- dyktowanie klienta korzysta wyłącznie z natywnego `SpeechRecognition` / `webkitSpeechRecognition`,
- na desktopie zalecane są Chrome lub Edge; na iPhonie Safari,
- Firefox i inne przeglądarki bez natywnego rozpoznawania pokazują komunikat o zmianie przeglądarki zamiast wysyłać nagranie do OpenAI,
- zwykłe dyktowanie klienta nie korzysta z `OPENAI_API_KEY` i nie zużywa kredytów OpenAI,
- `OPENAI_API_KEY` pozostaje obsługiwany wyłącznie przez istniejącą ręczną funkcję odczytu tabliczki przez AI,
- parser naturalnej wypowiedzi z 9.05 pozostaje: adres 19/19, e-mail i 9-cyfrowy telefon są rozdzielane bez obowiązkowych komend,
- brak nowej migracji Supabase.

## Kontrola
- test parsera głosowego i realnego przypadku 19/19 + telefon: PASS ×2,
- kontrola braku `MediaRecorder`, `/api/transcribe-client-voice` i endpointu głosowego: PASS ×2,
- test wersji desktop + mobile: PASS ×2,
- test wielu adresów kontrahenta: PASS ×2,
- test tworzenia i powiązania kontrahenta ze zleceniem: PASS ×2,
- test kompatybilności regex: PASS ×2,
- `verify:release`: PASS ×2,
- test istniejącej ręcznej funkcji odczytu tabliczek przez AI: PASS ×2,
- pełny Vite build i Playwright: nieuruchomione lokalnie; instalacja zależności nie wystartowała w tym środowisku przed etapem kompilacji.

## Wdrożenie
- brak SQL do uruchamiania,
- wdrożyć aplikację 9.07 standardowym workflow Vercel,
- do dyktowania klienta nie trzeba dodawać ani doładowywać OpenAI API,
- na komputerze do dyktowania używać Chrome lub Edge; Firefox pokaże informację o nieobsługiwanej funkcji.
