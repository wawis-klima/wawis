-- Atrapa pg_net do testów (sygnatury jak w produkcji): zapytania zapisywane, odpowiedzi wstawia test.
create schema if not exists net;
create table if not exists net._http_response (id bigint primary key, status_code integer, content_type text, headers jsonb,
  content text, timed_out boolean, error_msg text, created timestamptz not null default now());
create table if not exists net.test_requests (id bigserial primary key, url text not null, params jsonb not null);
create or replace function net.http_get(url text, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 5000) returns bigint language sql
as $$ insert into net.test_requests(url, params) values (url, params) returning id $$;
