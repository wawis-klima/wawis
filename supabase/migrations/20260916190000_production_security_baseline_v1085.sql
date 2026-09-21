-- WAWIS 10.85 / N7-A
-- Idempotent source-of-truth baseline captured from the live production definitions on 2026-09-16.
-- This intentionally preserves current production behavior; it does not introduce the N2 nameplate-completion guard.

create schema if not exists private;

create or replace function private.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.role() = 'service_role' or auth.uid() is null then return new; end if;
  if public.current_user_is_admin() then return new; end if;
  if tg_op='INSERT' then
    if new.id is distinct from auth.uid() or new.role is distinct from 'Pracownik' then raise exception 'Brak uprawnień do nadania roli.' using errcode='42501'; end if;
  elsif new.id is distinct from old.id or new.role is distinct from old.role then
    raise exception 'Tylko administrator może zmieniać role.' using errcode='42501';
  end if;
  return new;
end $function$;

create or replace function private.guard_job_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.role()='service_role' or auth.uid() is null or public.current_user_is_admin() then
    return new;
  end if;

  if tg_op='INSERT' then
    -- Dla pracownika źródłem tożsamości jest zawsze aktywna sesja Supabase.
    -- Nie ufamy wartości created_by przesłanej przez klienta / cache aplikacji.
    new.created_by := auth.uid();

    if new.main_technician_id is not null
       or coalesce(new.admin_note,'')<>''
       or coalesce(new.status,'') not in ('Nowe','W trakcie') then
      raise exception 'Brak uprawnień do przypisania lub statusu.' using errcode='42501';
    end if;
  else
    if old.status='Zakończone' then
      if (to_jsonb(new) - array['payment_confirmation_enabled','payment_amount','payment_kind','payment_method','payment_paid_at','payment_recorded_by','payment_updated_at'])
         is distinct from (to_jsonb(old) - array['payment_confirmation_enabled','payment_amount','payment_kind','payment_method','payment_paid_at','payment_recorded_by','payment_updated_at'])
         or (new.payment_recorded_by is not null and new.payment_recorded_by<>auth.uid()) then
        raise exception 'Zakończona karta pozwala tylko zapisać potwierdzenie płatności.' using errcode='42501';
      end if;
      return new;
    end if;

    if new.created_by is distinct from old.created_by
       or new.main_technician_id is distinct from old.main_technician_id
       or coalesce(new.admin_note,'') is distinct from coalesce(old.admin_note,'')
       or new.sms_consent is distinct from old.sms_consent
       or new.sms_reminder_enabled is distinct from old.sms_reminder_enabled
       or new.completed_at is distinct from old.completed_at
       or new.completed_by is distinct from old.completed_by then
      raise exception 'Brak uprawnień do zmiany pól administratora lub zakończonej karty.' using errcode='42501';
    end if;

    if new.status is distinct from old.status
       and not ((old.status='W trakcie' and new.status='Zakończone')
         or (old.status in ('Nowe','Niezrealizowane','Nowe zlecenie') and new.status='W trakcie')) then
      raise exception 'Niedozwolona zmiana statusu.' using errcode='42501';
    end if;
  end if;

  return new;
end
$function$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Użytkownik'),
    new.email,
    'Oczekujący'
  );
  return new;
end;
$function$;

-- Reassert trigger bindings so a restored project has the same protection points.
drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
before insert or update on public.profiles
for each row execute function private.guard_profile_role();

drop trigger if exists protect_job_fields on public.jobs;
create trigger protect_job_fields
before insert or update on public.jobs
for each row execute function private.guard_job_fields();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
