-- WAWIS 12.65 — potwierdzenia odbioru i wyświetlenia PUSH
alter table public.push_delivery_log
  add column if not exists receipt_token_hash text,
  add column if not exists received_at timestamptz,
  add column if not exists displayed_at timestamptz,
  add column if not exists receipt_updated_at timestamptz;

create unique index if not exists push_delivery_log_receipt_token_hash_uidx
  on public.push_delivery_log (receipt_token_hash)
  where receipt_token_hash is not null;

create index if not exists push_delivery_log_pending_display_idx
  on public.push_delivery_log (created_at desc)
  where status = 'sent' and displayed_at is null;

comment on column public.push_delivery_log.receipt_token_hash is
  'SHA-256 jednorazowego tokenu potwierdzenia przekazanego wyłącznie w zaszyfrowanym payloadzie Web Push.';
comment on column public.push_delivery_log.received_at is
  'Czas, w którym Service Worker urządzenia odebrał payload PUSH.';
comment on column public.push_delivery_log.displayed_at is
  'Czas, w którym Service Worker zakończył showNotification bez błędu.';
comment on column public.push_delivery_log.receipt_updated_at is
  'Czas ostatniego przyjętego potwierdzenia odbioru/wyświetlenia.';
