from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'scripts/smoke-push-logout-handoff-v1076.mjs'
text = path.read_text(encoding='utf-8')
old = "const deactivate = auth.indexOf('await deactivatePushForLogout({ supabase })');"
new = "const deactivate = auth.indexOf('await deactivatePushForLogout({ supabase, sessionUser })');"
if text.count(old) != 1:
    raise SystemExit('Nie znaleziono starego wywołania deactivatePushForLogout w smoke 10.76.')
text = text.replace(old, new, 1)
text = text.replace("assert.ok(deactivate >= 0 && clearStorage > deactivate, 'PUSH nadal musi być dezaktywowany przed czyszczeniem sesji');", "assert.ok(deactivate >= 0 && clearStorage > deactivate, 'PUSH nadal musi być dezaktywowany przed czyszczeniem sesji');\nassert.match(auth, /deactivatePushForLogout\\(\\{ supabase, sessionUser \\}\\)/, 'Logout 10.83 musi przekazać bieżącego użytkownika bez dodatkowego getSession.');", 1)
path.write_text(text, encoding='utf-8')
print('v10.76 logout smoke aligned with bounded v10.83 lifecycle')
