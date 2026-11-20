-- WAWIS 14.49 — jedno źródło prawdy dla roli administratora (audyt 20.11.2026, decyzja właściciela).
-- Problem: część kodu porównywała rolę dokładnie z tekstem 'Administrator' (admin_delete_comment, funkcje Edge
-- purge-service-visit i send-service-visit-protocol-email, interfejs aplikacji), a current_user_is_admin()
-- przyjmuje też 'admin'/'administrator' w dowolnej wielkości liter. Gdyby rola została zapisana inaczej niż
-- dokładnie 'Administrator', te miejsca po cichu odmówiłyby dostępu (albo interfejs ukryłby panel administratora,
-- a baza nadal traktowałaby konto jak administratora).
-- Poprawka:
--   1) profiles.role może mieć wyłącznie jedną z trzech wartości używanych przez WAWIS — każde porównanie
--      (dokładne i przez current_user_is_admin()) daje ten sam wynik;
--   2) admin_delete_comment sprawdza uprawnienia przez current_user_is_admin(), jak pozostałe funkcje administratora.
-- Dane bez zmian: produkcja 20.11.2026 ma tylko 'Administrator' (1) i 'Pracownik' (4). Można uruchomić ponownie.

do $$
begin
  if exists (
    select 1 from public.profiles
    where role is distinct from 'Administrator' and role is distinct from 'Pracownik' and role is distinct from 'Oczekujący'
  ) then
    raise exception 'WAWIS 14.49: w profiles.role jest wartość spoza listy (Administrator, Pracownik, Oczekujący) — popraw ją przed migracją.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_role_allowed_values_v1449'
  ) then
    alter table public.profiles
      add constraint profiles_role_allowed_values_v1449
      check (role in ('Administrator', 'Pracownik', 'Oczekujący'));
  end if;
end;
$$;

create or replace function public.admin_delete_comment(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_deleted integer;
begin
  if not public.current_user_is_admin() then
    raise exception 'Brak uprawnień administratora do usunięcia komentarza.';
  end if;

  delete from public.comments
  where id = p_comment_id;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$function$;
