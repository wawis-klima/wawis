from pathlib import Path

edge_path = Path('supabase/functions/send-assignment-push/index.ts')
edge = edge_path.read_text(encoding='utf-8')
old = '''      if (statusCode === 404 || statusCode === 410) {
        await adminClient.from("push_subscriptions").update({ is_active: false }).eq("id", subscription.id);
      }'''
new = '''      if (statusCode === 404 || statusCode === 410) {
        // 10.78: odpowiedź starej wysyłki nie może wyłączyć endpointu po handoffie A→B.
        // Dezaktywujemy tylko dokładnie tę własność/generację, z której wystartowała wysyłka.
        await adminClient
          .from("push_subscriptions")
          .update({ is_active: false })
          .eq("id", subscription.id)
          .eq("user_id", subscription.user_id)
          .eq("ownership_generation", subscription.ownership_generation)
          .eq("is_active", true);
      }'''
if old not in edge:
    raise SystemExit('Brak starego bezwarunkowego cleanupu 404/410')
edge_path.write_text(edge.replace(old, new, 1), encoding='utf-8')

test_path = Path('scripts/smoke-push-safety-v1078.mjs')
test = test_path.read_text(encoding='utf-8')
needle = '''  assert.match(edge, /subscriptionGeneration/);
  assert.doesNotMatch(edge.match(/async function handleSyncSubscription[\\s\\S]*?async function handleDisableSubscription/)?.[0] || '', /\\.upsert\\(/, 'Sync nie może wrócić do SELECT + bezwarunkowego UPSERT.');'''
replacement = '''  assert.match(edge, /subscriptionGeneration/);
  assert.doesNotMatch(edge.match(/async function handleSyncSubscription[\\s\\S]*?async function handleDisableSubscription/)?.[0] || '', /\\.upsert\\(/, 'Sync nie może wrócić do SELECT + bezwarunkowego UPSERT.');
  const expiredCleanup = edge.match(/if \\(statusCode === 404 \\|\\| statusCode === 410\\) \\{[\\s\\S]*?\\n      \\}/)?.[0] || '';
  assert.match(expiredCleanup, /\\.eq\\("user_id", subscription\\.user_id\\)/, 'Stara wysyłka nie może wyłączyć nowego właściciela endpointu.');
  assert.match(expiredCleanup, /\\.eq\\("ownership_generation", subscription\\.ownership_generation\\)/, 'Cleanup 404\\/410 musi być przypięty do generacji wysyłki.');'''
if needle not in test:
    raise SystemExit('Brak miejsca na asercję cleanupu generacji')
test_path.write_text(test.replace(needle, replacement, 1), encoding='utf-8')

print('PATCH expiry race v10.78 applied')
