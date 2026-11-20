# RELEASE RESULT - Wawis 9.06

## Wersja
- 9.06

## Tryb
- mobile + desktop — wspólne głosowe wprowadzanie danych klienta.

## Zakres
- przycisk `Wprowadź głosowo` oraz mikrofony przy pojedynczych polach działają także na desktopie,
- w Chrome/Edge używane jest natywne `SpeechRecognition`, jeżeli przeglądarka je udostępnia,
- w Firefox i innych przeglądarkach bez Web Speech aplikacja korzysta z `MediaRecorder`,
- po `Zakończ i sprawdź` nagranie jest wysyłane do `/api/transcribe-client-voice`, transkrybowane i przepuszczane przez parser 9.05,
- endpoint wymaga ważnej sesji Supabase i trzyma `OPENAI_API_KEY` wyłącznie po stronie Vercela,
- nagranie nie jest zapisywane w Supabase ani Storage,
- domyślny model transkrypcji: `gpt-4o-mini-transcribe`; opcjonalnie `OPENAI_VOICE_TRANSCRIPTION_MODEL`,
- komunikaty mikrofonu są wspólne dla mobile i desktopu zamiast odsyłać wyłącznie do Safari/iPhone,
- brak nowej migracji Supabase.

## Wymagania wdrożeniowe
- HTTPS (Vercel zapewnia),
- użytkownik musi zezwolić stronie na mikrofon,
- dla fallbacku Firefox musi istnieć `OPENAI_API_KEY` w środowisku Production Vercel; jest to ta sama zmienna, której używa `api/read-nameplate-ai.js`.

## Kontrola
- test parsera głosowego i realnego przypadku 19/19 + telefon: PASS ×2,
- kontrola fallbacku `MediaRecorder` i endpointu transkrypcji w teście smoke: PASS ×2,
- mock test endpointu `/api/transcribe-client-voice` z weryfikacją sesji i wywołaniem `/v1/audio/transcriptions`: PASS,
- kontrola składni nowego komponentu JSX przez TypeScript parser: PASS,
- test wersji: PASS ×2,
- test wielu adresów kontrahenta: PASS ×2,
- test tworzenia i powiązania kontrahenta ze zleceniem: PASS ×2,
- test kompatybilności regex i mobilnych tekstów: PASS ×2,
- `verify:release`: PASS ×2,
- pełny Vite build i Playwright: nieuruchomione lokalnie; instalacja zależności została zatrzymana przez E404 wewnętrznego proxy npm przed kompilacją kodu.

## Wdrożenie
- brak SQL do uruchamiania,
- wdrożyć aplikację 9.06 standardowym workflow Vercel,
- jeżeli `OPENAI_API_KEY` jest już ustawiony dla odczytu tabliczek AI, nie trzeba dodawać nowego klucza.
