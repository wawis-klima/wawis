from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'scripts/smoke-fuel-module-v1014.mjs'
text = path.read_text(encoding='utf-8')
old = '''assert.match(pushEdge, /title: "Zatankowano samochód"/);\nassert.match(pushEdge, /vehicleLabel[\\s\\S]*litersLabel[\\s\\S]*odometerLabel/, 'Treść push musi zawierać auto, litry i przebieg.');'''
new = '''assert.match(pushEdge, /title: "Nowe tankowanie"/, 'Push paliwa 10.83 ma używać neutralnego tytułu.');\nassert.match(pushEdge, /body: "Dodano nowe tankowanie\\. Otwórz aplikację Wawis, aby zobaczyć szczegóły\\."/, 'Treść PUSH nie może ujawniać danych tankowania na ekranie blokady.');\nassert.match(pushEdge, /recipientUserId: String\\(subscription\\.user_id \\|\\| ""\\)/, 'Payload musi wskazywać konkretnego odbiorcę.');\nassert.match(pushEdge, /subscriptionGeneration: Number\\(subscription\\.ownership_generation \\|\\| 0\\)/, 'Payload musi być przypięty do generacji subskrypcji.');\nassert.match(pushEdge, /\\.select\\("id, user_id, endpoint, p256dh, auth, ownership_generation"\\)/, 'Wysyłka musi odczytać generację własności endpointu.');\nassert.match(pushEdge, /\\.eq\\("user_id", subscription\\.user_id\\)/, 'Cleanup 404/410 musi być przypięty do odbiorcy.');\nassert.match(pushEdge, /\\.eq\\("ownership_generation", subscription\\.ownership_generation\\)/, 'Cleanup 404/410 musi być przypięty do generacji wysyłki.');\nconst payloadBlock = pushEdge.match(/const payload = JSON\\.stringify\\(\\{[\\s\\S]*?\\n      \\}\\);/)?.[0] || '';\nassert.doesNotMatch(payloadBlock, /vehicleLabel|litersLabel|odometerLabel|employee/, 'Payload PUSH paliwa nie może zawierać szczegółów tankowania ani nazwiska pracownika.');'''
if text.count(old) != 1:
    raise SystemExit('Nie znaleziono starych asercji treści PUSH paliwa.')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('fuel smoke aligned with v10.83 secure recipient/generation payload')
