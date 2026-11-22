\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
-- 1. iPhone A: subskrypcja K1/T1, potem nowe klucze K2 (ten sam adres)
select 'c1|' || reason from public.push_subscription_sync_atomic(:'A', 'https://web.push.apple.com/e1', 'K1', 'a1', 'T1');
select 'rekey_same|' || reason || '|' || ownership_generation from public.push_subscription_sync_atomic(:'A', 'https://web.push.apple.com/e1', 'K2', 'a2', 'T2');
select 'keys_now|' || p256dh || auth || lifecycle_token || is_active from public.push_subscriptions where endpoint = 'https://web.push.apple.com/e1';
select 'refresh|' || reason from public.push_subscription_sync_atomic(:'A', 'https://web.push.apple.com/e1', 'K2', 'a2', 'T2');
-- 2. wyłączenie przez A z jeszcze innymi kluczami (K3)
select 'disable_same|' || reason from public.push_subscription_disable_atomic(:'A', 'https://web.push.apple.com/e1', 'K3', 'a3', 'T3');
select 'after_disable|' || is_active from public.push_subscriptions where endpoint = 'https://web.push.apple.com/e1';
-- 3. wpis wyłączony, inny użytkownik B na tym telefonie z nowymi kluczami → przejmuje
select 'claim_other_inactive|' || reason || '|' || reassigned from public.push_subscription_sync_atomic(:'B', 'https://web.push.apple.com/e1', 'K4', 'a4', 'TB');
-- 4. aktywny wpis B, A z innymi kluczami → odrzucone (ochrona); stan bez zmian
