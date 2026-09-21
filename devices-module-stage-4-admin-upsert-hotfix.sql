-- Hotfix 7.08: naprawa konfliktu przeciążonych funkcji admin_upsert_device
-- oraz dopasowanie typu p_source_job_id do realnego typu kolumny public.devices.source_job_id.

begin;

-- Usuń znane przeciążenia, które powodowały konflikt przy rpc('admin_upsert_device', ...)
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, text, text, uuid, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, text, text, text, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, integer, text, text, text, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, integer, text, text, uuid, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, text, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, text);

DO $$
declare
  v_source_job_type text;
begin
  select data_type
    into v_source_job_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'devices'
    and column_name = 'source_job_id';

  if v_source_job_type is null then
    raise exception 'Nie znaleziono kolumny public.devices.source_job_id';
  end if;

  if v_source_job_type = 'uuid' then
    execute $fn$
      create function public.admin_upsert_device(
        p_id uuid default null,
        p_contractor_id uuid default null,
        p_model text default '',
        p_serial_number text default '',
        p_installation_date date default null,
        p_status text default 'aktywne',
        p_notes text default '',
        p_source_job_id uuid default null,
        p_source_kind text default 'manual'
      )
      returns public.devices
      language plpgsql
      security definer
      set search_path = public
      as $$
      declare
        v_row public.devices;
        v_status text;
      begin
        if not public.current_user_is_admin() then
          raise exception 'Tylko administrator może zapisywać urządzenia.';
        end if;

        v_status := coalesce(nullif(trim(p_status), ''), 'aktywne');
        if v_status not in ('aktywne', 'do_serwisu', 'zdemontowane') then
          raise exception 'Nieprawidłowy status urządzenia.';
        end if;

        if p_id is null then
          insert into public.devices (
            contractor_id,
            model,
            serial_number,
            installation_date,
            status,
            notes,
            source_job_id,
            source_kind
          )
          values (
            p_contractor_id,
            trim(coalesce(p_model, '')),
            trim(coalesce(p_serial_number, '')),
            p_installation_date,
            v_status,
            coalesce(p_notes, ''),
            p_source_job_id,
            coalesce(nullif(trim(coalesce(p_source_kind, '')), ''), 'manual')
          )
          returning * into v_row;
        else
          update public.devices
          set
            contractor_id = p_contractor_id,
            model = trim(coalesce(p_model, '')),
            serial_number = trim(coalesce(p_serial_number, '')),
            installation_date = p_installation_date,
            status = v_status,
            notes = coalesce(p_notes, ''),
            source_job_id = p_source_job_id,
            source_kind = coalesce(nullif(trim(coalesce(p_source_kind, '')), ''), source_kind)
          where id = p_id
          returning * into v_row;

          if v_row is null then
            raise exception 'Nie znaleziono urządzenia do edycji.';
          end if;
        end if;

        return v_row;
      end;
      $$;
    $fn$;

    execute 'grant execute on function public.admin_upsert_device(uuid, uuid, text, text, date, text, text, uuid, text) to authenticated';
  elsif v_source_job_type = 'text' then
    execute $fn$
      create function public.admin_upsert_device(
        p_id uuid default null,
        p_contractor_id uuid default null,
        p_model text default '',
        p_serial_number text default '',
        p_installation_date date default null,
        p_status text default 'aktywne',
        p_notes text default '',
        p_source_job_id text default null,
        p_source_kind text default 'manual'
      )
      returns public.devices
      language plpgsql
      security definer
      set search_path = public
      as $$
      declare
        v_row public.devices;
        v_status text;
      begin
        if not public.current_user_is_admin() then
          raise exception 'Tylko administrator może zapisywać urządzenia.';
        end if;

        v_status := coalesce(nullif(trim(p_status), ''), 'aktywne');
        if v_status not in ('aktywne', 'do_serwisu', 'zdemontowane') then
          raise exception 'Nieprawidłowy status urządzenia.';
        end if;

        if p_id is null then
          insert into public.devices (
            contractor_id,
            model,
            serial_number,
            installation_date,
            status,
            notes,
            source_job_id,
            source_kind
          )
          values (
            p_contractor_id,
            trim(coalesce(p_model, '')),
            trim(coalesce(p_serial_number, '')),
            p_installation_date,
            v_status,
            coalesce(p_notes, ''),
            nullif(trim(coalesce(p_source_job_id, '')), ''),
            coalesce(nullif(trim(coalesce(p_source_kind, '')), ''), 'manual')
          )
          returning * into v_row;
        else
          update public.devices
          set
            contractor_id = p_contractor_id,
            model = trim(coalesce(p_model, '')),
            serial_number = trim(coalesce(p_serial_number, '')),
            installation_date = p_installation_date,
            status = v_status,
            notes = coalesce(p_notes, ''),
            source_job_id = nullif(trim(coalesce(p_source_job_id, '')), ''),
            source_kind = coalesce(nullif(trim(coalesce(p_source_kind, '')), ''), source_kind)
          where id = p_id
          returning * into v_row;

          if v_row is null then
            raise exception 'Nie znaleziono urządzenia do edycji.';
          end if;
        end if;

        return v_row;
      end;
      $$;
    $fn$;

    execute 'grant execute on function public.admin_upsert_device(uuid, uuid, text, text, date, text, text, text, text) to authenticated';
  else
    raise exception 'Nieobsługiwany typ public.devices.source_job_id: %', v_source_job_type;
  end if;
end
$$;

commit;
