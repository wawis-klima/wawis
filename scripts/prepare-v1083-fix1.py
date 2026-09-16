from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'scripts/smoke-push-safety-v1078.mjs'
text = path.read_text(encoding='utf-8')
old = '''  assert.match(push, /getOrCreatePushLifecycleToken/);\n  assert.match(push, /setPushServiceWorkerContext/);\n  assert.match(push, /clearPushServiceWorkerContext/);\n  assert.match(push, /const needsStandalone = true/);'''
new = '''  assert.match(push, /getOrCreatePushLifecycleToken/);\n  assert.match(push, /publishPushServiceWorkerContext/);\n  assert.match(push, /clearCurrentPushServiceWorkerContext/);\n  assert.match(push, /isPushSessionContextCurrent/);\n  assert.match(push, /const needsStandalone = true/);'''
if text.count(old) != 1:
    raise SystemExit('Nie znaleziono kontraktu push safety v10.78 do aktualizacji.')
text = text.replace(old, new, 1)
old_sw = '''  assert.match(sw, /WAWIS_PUSH_CONTEXT_SET/);\n  assert.match(sw, /WawisPushSafety\\?\\.shouldDisplayPush/);'''
new_sw = '''  assert.match(sw, /WAWIS_PUSH_CONTEXT_SET/);\n  assert.match(sw, /WawisPushContextGuard\\?\\.shouldApplyContextCommand/);\n  assert.match(sw, /revision/);\n  assert.match(sw, /WawisPushSafety\\?\\.shouldDisplayPush/);'''
if text.count(old_sw) != 1:
    raise SystemExit('Nie znaleziono kontraktu Service Workera do aktualizacji.')
path.write_text(text.replace(old_sw, new_sw, 1), encoding='utf-8')
print('v10.78 smoke aligned with v10.83 stronger PUSH context contract')
