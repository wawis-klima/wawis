-- WAWIS 14.23: dodatek do scaffold 14.08 — minimalne tabele przeglądów (jednorazowa baza, nigdy produkcja).
create table public.service_visits (id uuid primary key, contractor_id uuid, status text not null default 'zaplanowany',
  deleted_at timestamptz);
create table public.service_visit_devices (id uuid primary key, service_visit_id uuid not null references public.service_visits(id),
  device_id uuid references public.devices(id) on delete set null, model_snapshot text not null default '');
alter table public.service_visits enable row level security;
alter table public.service_visit_devices enable row level security;
