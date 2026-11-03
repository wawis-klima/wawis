-- WAWIS 14.20 — zgłoszenia od klientów z naklejki QR (decyzja właściciela 03.11.2026).
-- Klient skanuje naklejkę, widzi publiczną stronę (model, termin przeglądu, telefon firmy) i wysyła
-- zgłoszenie „Awaria” albo „Przegląd”. Zgłoszenia zapisuje WYŁĄCZNIE funkcja Edge qr-service-request
-- (service_role, z limitami przeciw spamowi); aplikacja klienta nie ma dostępu do tabeli.
-- Administrator czyta i oznacza zgłoszenia przez funkcje poniżej. Bez zmian istniejących tabel i danych.

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  qr_code text not null references public.qr_stickers(code) on delete restrict,
  device_id uuid references public.devices(id) on delete set null,
  contractor_id uuid references public.contractors(id) on delete set null,
  kind text not null check (kind in ('awaria', 'przeglad')),
  description text not null default '' check (length(description) <= 1000),
  phone text not null check (phone ~ '^48[0-9]{9}$'),
  status text not null default 'nowe' check (status in ('nowe', 'zalatwione')),
  handled_at timestamptz,
  handled_by uuid references public.profiles(id) on delete set null,
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  push_delivered integer not null default 0
);
create index if not exists service_requests_created_idx on public.service_requests(created_at desc);
create index if not exists service_requests_code_idx on public.service_requests(qr_code, created_at desc);
create index if not exists service_requests_ip_idx on public.service_requests(ip_hash, created_at desc);

alter table public.service_requests enable row level security;
revoke all on table public.service_requests from public, anon, authenticated;
grant select, insert, update on table public.service_requests to service_role;

-- Lista dla administratora: zgłoszenie + dane klienta i urządzenia (bez dostępu do samej tabeli).
create or replace function public.service_requests_list_v1420(p_limit integer default 200)
returns table (
  id uuid, created_at timestamptz, qr_code text, kind text, description text, phone text,
  status text, handled_at timestamptz,
  device_id uuid, device_model text, device_serial text, installation_date date,
  contractor_id uuid, contractor_name text, contractor_city text, contractor_street text, contractor_phone text
)
language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception 'service_requests_admin_only' using errcode = '42501';
  end if;
  return query
  select r.id, r.created_at, r.qr_code, r.kind, r.description, r.phone,
         r.status, r.handled_at,
         d.id, d.model, d.serial_number, d.installation_date,
         c.id, c.company_name, c.city, c.street, c.phone
    from public.service_requests r
    left join public.devices d on d.id = r.device_id
    left join public.contractors c on c.id = coalesce(r.contractor_id, d.contractor_id)
   order by (r.status = 'nowe') desc, r.created_at desc
   limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$fn$;
revoke all on function public.service_requests_list_v1420(integer) from public, anon;
grant execute on function public.service_requests_list_v1420(integer) to authenticated;

create or replace function public.service_request_set_status_v1420(p_id uuid, p_status text)
returns boolean
language plpgsql security definer set search_path = ''
as $fn$
declare changed boolean := false;
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception 'service_requests_admin_only' using errcode = '42501';
  end if;
  if p_status not in ('nowe', 'zalatwione') then
    raise exception 'service_request_bad_status' using errcode = '22023';
  end if;
  update public.service_requests
     set status = p_status,
         handled_at = case when p_status = 'zalatwione' then now() else null end,
         handled_by = case when p_status = 'zalatwione' then auth.uid() else null end
   where id = p_id
  returning true into changed;
  return coalesce(changed, false);
end;
$fn$;
revoke all on function public.service_request_set_status_v1420(uuid, text) from public, anon;
grant execute on function public.service_request_set_status_v1420(uuid, text) to authenticated;
