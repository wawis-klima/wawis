-- WAWIS 14.80 — atrapa tabel PUSH (kolumny jak produkcja 22.11.2026).
create schema if not exists private;
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, endpoint text not null unique, p256dh text not null, auth text not null,
  user_agent text, device_label text, is_active boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), lifecycle_token text not null,
  ownership_generation bigint not null default 1, context_epoch bigint not null default 1);
create table private.push_subscription_lifecycle_tombstones (endpoint text not null, p256dh text not null, auth text not null,
  user_id uuid not null, lifecycle_token text not null, invalidated_at timestamptz not null default now(),
  primary key (endpoint, p256dh, auth, user_id, lifecycle_token));
