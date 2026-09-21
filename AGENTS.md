# WAWIS — zasady dla agentów kodujących

## Tryb domyślny
- Najpierw analizuj, potem proponuj. Nie modyfikuj kodu bez wyraźnego polecenia.
- Przy audycie traktuj repozytorium jako read-only.
- Nie wdrażaj, nie merguj, nie pushuj do `main`, nie twórz migracji ani nie zmieniaj danych produkcyjnych.

## Obszary chronione
Bez osobnej zgody nie zmieniaj:
- Supabase: schematu, migracji, RLS, uprawnień, Storage, Edge Functions, sekretów;
- auth, ról admin/pracownik, Realtime, push, service workera i cache;
- procesu release GitHub/Vercel, `RELEASE-GATE.json`, workflowów i polityk deployu;
- logiki protokołów PDF/e-mail, uploadu zdjęć i retry;
- danych klientów ani logiki produkcyjnej.

## Zasady audytu
- Każde znalezisko musi zawierać dowód: plik, funkcję/fragment i wyjaśnienie mechanizmu problemu.
- Nie zgłaszaj problemu tylko na podstawie stylu lub przypuszczenia.
- Odróżniaj faktyczne błędy od długu technicznego i sugestii refaktoru.
- Priorytety: P0 = ryzyko utraty danych/bezpieczeństwa/awarii produkcji; P1 = poważny błąd lub freeze/race; P2 = wydajność, utrzymanie, duplikacja, jakość testów; P3 = kosmetyka.
- Preferuj małe, odwracalne poprawki i osobne PR-y.
- Nie wykonuj destrukcyjnych komend ani zewnętrznych operacji produkcyjnych.

## Kontekst aplikacji
WAWIS to aplikacja React/Vite z Supabase, mobilnym interfejsem dla pracowników i desktopowym panelem administratora. Kluczowe moduły obejmują montaże, kontrahentów, urządzenia, zdjęcia/tabliczki, protokoły PDF/e-mail, push, paliwo/tankowania, diagnostykę i release automation.
