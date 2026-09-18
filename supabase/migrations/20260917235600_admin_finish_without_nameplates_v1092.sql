-- WAWIS 10.92 — administrator może zakończyć montaż bez zdjęć tabliczek.
-- Pracownik nadal musi posiadać rzeczywiste zdjęcia wymaganych JZ/JW.
-- Ręczne potwierdzenia pozostają jako opcjonalna informacja administracyjna,
-- ale nie są warunkiem zakończenia zlecenia przez administratora.

create or replace function private.assert_job_nameplates_complete(
  p_job_id uuid,
  p_device_model text,
  p_device_serial_number text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_required record;
  v_missing text[] := array[]::text[];
  v_admin_bypass boolean := (
    coalesce(auth.role(), '') = 'service_role'
    or public.current_user_is_admin()
  );
begin
  if p_job_id is null then
    raise exception 'job_nameplates_invalid_job' using errcode = '22023';
  end if;

  -- 10.92: tylko administrator (oraz wewnętrzny service_role) może
  -- zakończyć zlecenie bez fizycznych zdjęć tabliczek.
  if v_admin_bypass then
    return;
  end if;

  for v_required in
    select *
    from private.job_nameplate_requirements(p_job_id, p_device_model, p_device_serial_number)
  loop
    if not exists (
      select 1
      from public.photos p
      where p.job_id = p_job_id
        and p.photo_kind = 'nameplate'
        and p.device_index = v_required.device_index
        and p.unit_ref = v_required.unit_ref
        and (
          nullif(pg_catalog.btrim(coalesce(p.storage_path, '')), '') is not null
          or nullif(pg_catalog.btrim(coalesce(p.image_url, '')), '') is not null
        )
    ) then
      v_missing := pg_catalog.array_append(
        v_missing,
        'device-' || v_required.device_index::text || ':' || v_required.unit_ref
      );
    end if;
  end loop;

  if coalesce(pg_catalog.array_length(v_missing, 1), 0) > 0 then
    raise exception 'job_nameplates_incomplete: %', pg_catalog.array_to_string(v_missing, ', ')
      using errcode = '23514';
  end if;
end;
$$;

comment on function private.assert_job_nameplates_complete(uuid, text, text) is
  'WAWIS 10.92: administrator/service_role może zakończyć bez tabliczek; pracownik nadal wymaga fizycznych zdjęć JZ/JW.';
