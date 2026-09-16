-- WAWIS 10.87 — clients may read their RLS-filtered PUSH row, but all mutation goes through controlled RPC/Edge paths.
revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select on table public.push_subscriptions to authenticated;
