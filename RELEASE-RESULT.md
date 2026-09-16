# RELEASE RESULT

## Wersja
- 10.87

## Zakres
- F4 — trwałe porządkowanie kontekstu PUSH po stronie Service Workera na podstawie właściciela i ownership_generation; warunkowy SET/CLEAR odporny na reload, wiele kart i spóźnione komendy starej sesji.
- F10 — timeout dla każdego bezpośredniego getSubscription/subscribe/unsubscribe na mobile i desktopie oraz guard późnych wyników desktopowej synchronizacji.
- F11 — kontrolowane RPC dla zapisu klienta, atomowy expire z tombstone oraz końcowe odebranie bezpośredniego DML anon/authenticated.

## Dowód RED → GREEN
- GitHub Actions run 35135597774: dokładny SHA 10.84 odtworzył RED F4/F10/F11 i następnie zatrzymał się na brakującym kontrakcie 10.87.
- smoke-audit-fixes-v1087 po poprawce: PASS.
- grupa PUSH: PASS.
- production build: PASS.

## Wdrożenie F11
1. migracja RPC,
2. deploy obu Edge Functions używających push_subscription_expire_atomic,
3. migracja ACL odbierająca klientom DML,
4. read-back produkcji.

## Warunek zamknięcia
Finalny targeted-checks + Playwright E2E + build, merge przez ruleset, Vercel SUCCESS/live 10.87 oraz produkcyjny read-back Supabase.
