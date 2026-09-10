-- DB repair 7.10: zbiorcza naprawa modułu Urządzenia.
--
-- Cel:
-- - usunąć konfliktujące przeciążenia admin_upsert_device,
-- - odbudować spójne funkcje i trigger synchronizacji urządzeń z montaży,
-- - zachować aktualny typ public.devices.source_job_id (uuid albo text),
-- - nie rozwalać istniejących kluczy obcych, jeśli kolumna działa na uuid.
--
-- Użycie:
-- 1. Uruchom ten plik w Supabase SQL Editor.
-- 2. Po wykonaniu odśwież aplikację.
-- 3. Przetestuj edycję urządzenia i synchronizację z modułem Montaże.

begin;

-- Usuń konfliktujące przeciążenia RPC.
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, text, text, uuid, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, text, text, text, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, integer, text, text, text, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, integer, text, text, uuid, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, text, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, date, text);
drop function if exists public.admin_upsert_device(uuid, uuid, text, text, text);

drop trigger if exists jobs_sync_device_after_change on public.jobs;
drop function if exists public.sync_device_from_job_trigger();
drop function if exists public.admin_sync_devices_from_jobs();
drop function if exists public.sync_device_from_job_row(text, uuid, text, text, date);
drop function if exists public.sync_device_from_job_row(uuid, uuid, text, text, date);

do $$
declare
  v_source_job_type text;
  v_has_fk boolean := false;
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

  select exists (
    select 1
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    where tc.table_schema = 'public'
      and tc.table_name = 'devices'
      and tc.constraint_type = 'FOREIGN KEY'
      and kcu.column_name = 'source_job_id'
  ) into v_has_fk;

  execute 'drop index if exists public.devices_source_job_id_key';
  execute 'create unique index if not exists devices_source_job_id_key on public.devices (source_job_id) where source_job_id is not null';

  if v_source_job_type = 'uuid' then
    -- Zachowaj zgodność z FK do jobs.id.
    if not v_has_fk then
      begin
        execute 'alter table public.devices add constraint devices_source_job_id_fkey foreign key (source_job_id) references public.jobs(id) on delete cascade';
      exception
        when duplicate_object then null;
      end;
    end if;

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
            source_kind = coalesce(nullif(trim(coalesce(p_source_kind, '')), ''), source_kind),
            updated_at = timezone('utc', now())
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

    execute $fn$
      create function public.sync_device_from_job_row(
        p_job_id uuid,
        p_contractor_id uuid,
        p_model text,
        p_serial_number text,
        p_installation_date date
      )
      returns void
      language plpgsql
      security definer
      set search_path = public
      as $$
      begin
        if coalesce(trim(p_model), '') = '' and coalesce(trim(p_serial_number), '') = '' then
          delete from public.devices where source_job_id = p_job_id;
          return;
        end if;

        insert into public.devices (
          contractor_id,
          source_job_id,
          source_kind,
          model,
          serial_number,
          installation_date
        )
        values (
          p_contractor_id,
          p_job_id,
          'job',
          trim(coalesce(p_model, '')),
          trim(coalesce(p_serial_number, '')),
          p_installation_date
        )
        on conflict (source_job_id) do update
        set contractor_id = excluded.contractor_id,
            model = excluded.model,
            serial_number = excluded.serial_number,
            installation_date = excluded.installation_date,
            source_kind = 'job',
            updated_at = timezone('utc', now());
      end;
      $$;
    $fn$;

    execute $fn$
      create function public.admin_sync_devices_from_jobs()
      returns jsonb
      language plpgsql
      security definer
      set search_path = public
      as $$
      declare
        v_processed integer := 0;
        v_deleted integer := 0;
      begin
        if not public.current_user_is_admin() then
          raise exception 'Tylko administrator może synchronizować urządzenia.';
        end if;

        insert into public.devices (
          contractor_id,
          source_job_id,
          source_kind,
          model,
          serial_number,
          installation_date
        )
        select
          j.contractor_id,
          j.id,
          'job',
          trim(coalesce(j.device_model, '')),
          trim(coalesce(j.device_serial_number, '')),
          j.installation_date
        from public.jobs j
        where coalesce(trim(j.device_model), '') <> ''
           or coalesce(trim(j.device_serial_number), '') <> ''
        on conflict (source_job_id) do update
        set contractor_id = excluded.contractor_id,
            model = excluded.model,
            serial_number = excluded.serial_number,
            installation_date = excluded.installation_date,
            source_kind = 'job',
            updated_at = timezone('utc', now());

        get diagnostics v_processed = row_count;

        delete from public.devices d
        where d.source_kind = 'job'
          and not exists (
            select 1
            from public.jobs j
            where j.id = d.source_job_id
              and (
                coalesce(trim(j.device_model), '') <> ''
                or coalesce(trim(j.device_serial_number), '') <> ''
              )
          );

        get diagnostics v_deleted = row_count;

        return jsonb_build_object('processed', v_processed, 'deleted', v_deleted);
      end;
      $$;
    $fn$;

    execute $fn$
      create function public.sync_device_from_job_trigger()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $$
      begin
        if tg_op = 'DELETE' then
          delete from public.devices where source_job_id = old.id;
          return old;
        end if;

        perform public.sync_device_from_job_row(
          new.id,
          new.contractor_id,
          new.device_model,
          new.device_serial_number,
          new.installation_date
        );

        return new;
      end;
      $$;
    $fn$;

    execute 'grant execute on function public.admin_upsert_device(uuid, uuid, text, text, date, text, text, uuid, text) to authenticated';
    execute 'grant execute on function public.sync_device_from_job_row(uuid, uuid, text, text, date) to authenticated';
    execute 'grant execute on function public.admin_sync_devices_from_jobs() to authenticated';

  elsif v_source_job_type = 'text' then
    -- Fallback dla baz, gdzie source_job_id było już celowo przerobione na text.
    if v_has_fk then
      raise exception 'Wykryto sprzeczny stan: source_job_id ma typ text, ale nadal istnieje FK. Napraw najpierw constraints.';
    end if;

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
            source_kind = coalesce(nullif(trim(coalesce(p_source_kind, '')), ''), source_kind),
            updated_at = timezone('utc', now())
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

    execute $fn$
      create function public.sync_device_from_job_row(
        p_job_id text,
        p_contractor_id uuid,
        p_model text,
        p_serial_number text,
        p_installation_date date
      )
      returns void
      language plpgsql
      security definer
      set search_path = public
      as $$
      begin
        if coalesce(trim(p_model), '') = '' and coalesce(trim(p_serial_number), '') = '' then
          delete from public.devices where source_job_id = p_job_id;
          return;
        end if;

        insert into public.devices (
          contractor_id,
          source_job_id,
          source_kind,
          model,
          serial_number,
          installation_date
        )
        values (
          p_contractor_id,
          p_job_id,
          'job',
          trim(coalesce(p_model, '')),
          trim(coalesce(p_serial_number, '')),
          p_installation_date
        )
        on conflict (source_job_id) do update
        set contractor_id = excluded.contractor_id,
            model = excluded.model,
            serial_number = excluded.serial_number,
            installation_date = excluded.installation_date,
            source_kind = 'job',
            updated_at = timezone('utc', now());
      end;
      $$;
    $fn$;

    execute $fn$
      create function public.admin_sync_devices_from_jobs()
      returns jsonb
      language plpgsql
      security definer
      set search_path = public
      as $$
      declare
        v_processed integer := 0;
        v_deleted integer := 0;
      begin
        if not public.current_user_is_admin() then
          raise exception 'Tylko administrator może synchronizować urządzenia.';
        end if;

        insert into public.devices (
          contractor_id,
          source_job_id,
          source_kind,
          model,
          serial_number,
          installation_date
        )
        select
          j.contractor_id,
          j.id::text,
          'job',
          trim(coalesce(j.device_model, '')),
          trim(coalesce(j.device_serial_number, '')),
          j.installation_date
        from public.jobs j
        where coalesce(trim(j.device_model), '') <> ''
           or coalesce(trim(j.device_serial_number), '') <> ''
        on conflict (source_job_id) do update
        set contractor_id = excluded.contractor_id,
            model = excluded.model,
            serial_number = excluded.serial_number,
            installation_date = excluded.installation_date,
            source_kind = 'job',
            updated_at = timezone('utc', now());

        get diagnostics v_processed = row_count;

        delete from public.devices d
        where d.source_kind = 'job'
          and not exists (
            select 1
            from public.jobs j
            where j.id::text = d.source_job_id
              and (
                coalesce(trim(j.device_model), '') <> ''
                or coalesce(trim(j.device_serial_number), '') <> ''
              )
          );

        get diagnostics v_deleted = row_count;

        return jsonb_build_object('processed', v_processed, 'deleted', v_deleted);
      end;
      $$;
    $fn$;

    execute $fn$
      create function public.sync_device_from_job_trigger()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $$
      begin
        if tg_op = 'DELETE' then
          delete from public.devices where source_job_id = old.id::text;
          return old;
        end if;

        perform public.sync_device_from_job_row(
          new.id::text,
          new.contractor_id,
          new.device_model,
          new.device_serial_number,
          new.installation_date
        );

        return new;
      end;
      $$;
    $fn$;

    execute 'grant execute on function public.admin_upsert_device(uuid, uuid, text, text, date, text, text, text, text) to authenticated';
    execute 'grant execute on function public.sync_device_from_job_row(text, uuid, text, text, date) to authenticated';
    execute 'grant execute on function public.admin_sync_devices_from_jobs() to authenticated';

  else
    raise exception 'Nieobsługiwany typ public.devices.source_job_id: %', v_source_job_type;
  end if;
end
$$;

create trigger jobs_sync_device_after_change
after insert or update of contractor_id, device_model, device_serial_number, installation_date or delete on public.jobs
for each row
execute function public.sync_device_from_job_trigger();

commit;
