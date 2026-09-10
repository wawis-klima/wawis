-- Wawis Klimatyzacja v9.13
-- Ręczne potwierdzenie tabliczki przez administratora, również gdy zdjęcie tabliczki nie istnieje.
-- Nie zmienia mobilnego wymogu wykonania zdjęć przed zakończeniem montażu.

begin;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(trim(coalesce(p.role, ''))) in ('administrator', 'admin')
  ), false);
$$;

grant execute on function public.current_user_is_admin() to authenticated;

create table if not exists public.nameplate_manual_verifications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  device_index integer not null check (device_index >= 1),
  unit_ref text not null check (unit_ref = 'jz' or unit_ref ~ '^jw-[1-5]$'),
  verified_by uuid default auth.uid(),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint nameplate_manual_verifications_job_unit_unique unique (job_id, device_index, unit_ref)
);

comment on table public.nameplate_manual_verifications is
  'Administracyjne ręczne potwierdzenie tabliczki JZ/JW. Istnienie wpisu oznacza potwierdzenie bez wpływu na mobilny wymóg zdjęcia.';

create index if not exists nameplate_manual_verifications_job_id_idx
  on public.nameplate_manual_verifications(job_id);

alter table public.nameplate_manual_verifications enable row level security;

drop policy if exists "nameplate_manual_verifications_admin_select" on public.nameplate_manual_verifications;
create policy "nameplate_manual_verifications_admin_select"
on public.nameplate_manual_verifications
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "nameplate_manual_verifications_admin_insert" on public.nameplate_manual_verifications;
create policy "nameplate_manual_verifications_admin_insert"
on public.nameplate_manual_verifications
for insert
to authenticated
with check (public.current_user_is_admin());

drop policy if exists "nameplate_manual_verifications_admin_update" on public.nameplate_manual_verifications;
create policy "nameplate_manual_verifications_admin_update"
on public.nameplate_manual_verifications
for update
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "nameplate_manual_verifications_admin_delete" on public.nameplate_manual_verifications;
create policy "nameplate_manual_verifications_admin_delete"
on public.nameplate_manual_verifications
for delete
to authenticated
using (public.current_user_is_admin());

grant select, insert, update, delete on public.nameplate_manual_verifications to authenticated;

commit;
