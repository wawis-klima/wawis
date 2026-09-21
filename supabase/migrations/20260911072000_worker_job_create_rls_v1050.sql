-- WAWIS 10.50 — pracownik może ponownie dodać nowe zlecenie.
-- 1) created_by pracownika zawsze pochodzi z aktywnej sesji Supabase.
-- 2) SELECT RLS dopuszcza świeżo wstawiony wiersz po created_by/main_technician_id,
--    dzięki czemu INSERT ... RETURNING używany przez aplikację nie kończy się błędem RLS
--    zanim zostanie dopisany job_access.

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

drop policy if exists jobs_read_access on public.jobs;
create policy jobs_read_access
on public.jobs
for select
to authenticated
using (
  created_by = auth.uid()
  or main_technician_id = auth.uid()
  or public.current_user_can_access_job(id)
);
