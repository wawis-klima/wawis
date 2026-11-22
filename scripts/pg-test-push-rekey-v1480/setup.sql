-- WAWIS 14.80 — atrapa tabel PUSH (kolumny jak produkcja 22.11.2026).
do $r$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if; end $r$;
create schema if not exists private;
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, endpoint text not null unique, p256dh text not null, auth text not null,
  user_agent text, device_label text, is_active boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), lifecycle_token text not null,
  ownership_generation bigint not null default 1, context_epoch bigint not null default 1);
create table private.push_subscription_lifecycle_tombstones (endpoint text not null, p256dh text not null, auth text not null,
  user_id uuid not null, lifecycle_token text not null, invalidated_at timestamptz not null default now(),
  primary key (endpoint, p256dh, auth, user_id, lifecycle_token));
-- Jak produkcja: RLS włączone, dostęp tylko przez funkcje (service_role); test działa jako postgres.
alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public;
grant select, insert, update, delete on table public.push_subscriptions to service_role;
