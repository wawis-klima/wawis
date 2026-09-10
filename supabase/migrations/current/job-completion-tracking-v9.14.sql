-- WAWIS 9.14 — rzeczywista data/godzina zakończenia zlecenia.
-- Uruchom raz w Supabase SQL Editor przed wdrożeniem aplikacji 9.14.
-- Skrypt jest idempotentny.

begin;

alter table public.jobs
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references public.profiles(id) on delete set null;

comment on column public.jobs.completed_at is
  'Rzeczywista chwila przejścia zlecenia do statusu Zakończone. Ustawiana automatycznie przez trigger.';

comment on column public.jobs.completed_by is
  'Użytkownik, który zmienił status zlecenia na Zakończone; auth.uid() w momencie zmiany.';

create or replace function public.set_job_completion_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'Zakończone' then
      new.completed_at := now();
      new.completed_by := auth.uid();
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status = 'Zakończone' and old.status is distinct from 'Zakończone' then
      new.completed_at := now();
      new.completed_by := auth.uid();
    elsif old.status = 'Zakończone' and new.status is distinct from 'Zakończone' then
      new.completed_at := null;
      new.completed_by := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_jobs_completion_metadata on public.jobs;
create trigger trg_jobs_completion_metadata
before insert or update of status on public.jobs
for each row
execute function public.set_job_completion_metadata();

-- Nie uzupełniamy completed_at dla starych zakończonych zleceń sztuczną datą.
-- Przed wersją 9.14 dokładna chwila zakończenia nie była zapisywana, więc pozostaje NULL.

commit;
