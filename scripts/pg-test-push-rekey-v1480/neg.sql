\set A '00000000-0000-0000-0000-00000000000a'
select public.push_subscription_sync_atomic(:'A', 'https://web.push.apple.com/e1', 'K5', 'a5', 'T5');
select public.push_subscription_disable_atomic(:'A', 'https://web.push.apple.com/e1', 'K5', 'a5', 'T5');
-- tombstone K3/T3 po wyłączeniu przez A: ponowna synchronizacja tymi samymi kluczami i tokenem = odrzucona
select public.push_subscription_sync_atomic(:'A', 'https://web.push.apple.com/e2', 'X', 'x', 'TX');
