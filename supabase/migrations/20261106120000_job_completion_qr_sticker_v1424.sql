-- WAWIS 14.24 — naklejka QR wymagana do zakończenia montażu przez pracownika (decyzja właściciela 06.11.2026).
-- Tak jak tabliczki i protokół: pracownik nie zakończy montażu, dopóki każde urządzenie montażu nie ma
-- przypisanej naklejki QR. Administrator zachowuje możliwość zakończenia (np. brak naklejek, demontaż).
-- Sprawdzenie tylko przy zmianie statusu na „Zakończone” — zakończone montaże, edycja i dane bez zmian.
-- Zmienia jedną funkcję wyzwalacza (treść z 12.26 + nowy warunek) i dodaje funkcję pomocniczą.
-- Bez zmian tabel i danych. Można uruchomić ponownie.

-- Numery urządzeń montażu bez przypisanej naklejki QR (puste = komplet albo montaż bez urządzeń).
create or replace function private.job_missing_qr_stickers_v1424(
  p_job_id uuid,
  p_device_model text,
  p_device_serial_number text
)
returns integer[]
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(pg_catalog.array_agg(r.device_index order by r.device_index), array[]::integer[])
  from (
    select distinct q.device_index
    from private.job_nameplate_requirements(p_job_id, p_device_model, p_device_serial_number) q
  ) r
  where nullif(pg_catalog.btrim(coalesce(p_device_model, '') || coalesce(p_device_serial_number, '')), '') is not null
    and not exists (
      select 1
      from public.devices d
      join public.qr_stickers s on s.device_id = d.id
      where d.source_job_id = case when r.device_index = 1 then p_job_id::text
                                   else p_job_id::text || '::device-' || r.device_index::text end
    )
$$;
revoke all on function private.job_missing_qr_stickers_v1424(uuid, text, text) from public, anon, authenticated;

create or replace function private.guard_job_completion_nameplates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing_qr integer[];
begin
  if new.status = 'Zakończone' and (
    tg_op = 'INSERT'
    or old.status is distinct from new.status
    or old.device_model is distinct from new.device_model
    or old.device_serial_number is distinct from new.device_serial_number
  ) then
    if coalesce(auth.role(), '') <> 'service_role' then
      -- Tylko pracownik ma obowiązek przygotować i podpisać protokół przed
      -- przejściem W trakcie -> Zakończone. Administrator zachowuje override.
      if not public.current_user_is_admin()
         and (tg_op = 'INSERT' or old.status is distinct from new.status)
         and not exists (
           select 1
           from public.job_protocols p
           where p.job_id = new.id
             and p.signed_at is not null
             and coalesce(p.file_size_bytes, 0) > 0
             and nullif(pg_catalog.btrim(coalesce(p.storage_path, '')), '') is not null
             and exists (
               select 1
               from storage.objects o
               where o.bucket_id = 'job-protocols'
                 and o.name = p.storage_path
             )
         ) then
        raise exception 'job_protocol_required: zapisz podpisany protokół przed zakończeniem zlecenia'
          using errcode = '23514';
      end if;

      -- 14.24: naklejka QR na każdym urządzeniu — pracownik, przy przejściu na „Zakończone”.
      if not public.current_user_is_admin()
         and (tg_op = 'INSERT' or old.status is distinct from new.status) then
        v_missing_qr := private.job_missing_qr_stickers_v1424(new.id, new.device_model, new.device_serial_number);
        if coalesce(pg_catalog.array_length(v_missing_qr, 1), 0) > 0 then
          raise exception 'job_qr_sticker_required: %', pg_catalog.array_to_string(v_missing_qr, ', ')
            using errcode = '23514';
        end if;
      end if;

      perform private.assert_job_nameplates_complete(new.id, new.device_model, new.device_serial_number);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_job_completion_nameplates() from public, anon, authenticated;
