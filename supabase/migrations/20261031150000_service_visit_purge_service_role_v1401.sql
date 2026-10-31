-- WAWIS 14.01 — naprawa trwałego usuwania serwisu z Kosza (błąd od 13.95).
-- Edge Function purge-service-visit działa kluczem service_role (bez auth.uid()); trigger przydziału
-- z 13.89 odrzucał KAŻDĄ zmianę wiersza bez zalogowanego administratora, więc
-- service_visit_purge_prepare_v1395 kończyło się błędem „Brak uprawnień do przydziału”.
-- Zmiana: zaufana rola serwerowa (service_role) może aktualizować wiersz; użytkownicy aplikacji
-- nadal muszą być administratorem. Audyt przydziału bez zmian. Migracja niedestrukcyjna.
create or replace function public.service_visit_assignment_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.current_user_is_admin() then
    raise exception 'Brak uprawnień do przydziału';
  end if;
  new.updated_at := now();
  if old.primary_technician_id is distinct from new.primary_technician_id or
     old.additional_technician_ids is distinct from new.additional_technician_ids then
    insert into public.service_visit_assignment_events(
      service_visit_id,old_primary_technician_id,new_primary_technician_id,
      old_additional_technician_ids,new_additional_technician_ids,changed_by)
    values(old.id,old.primary_technician_id,new.primary_technician_id,
      old.additional_technician_ids,new.additional_technician_ids,auth.uid());
  end if;
  return new;
end
$$;
revoke all on function public.service_visit_assignment_audit() from public, anon, authenticated;
