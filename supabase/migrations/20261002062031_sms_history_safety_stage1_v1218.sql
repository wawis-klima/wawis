set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Etap 1 / v12.18: historia SMS jest append-only w sensie fizycznego kasowania.
create or replace function public.protect_sms_log_history()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old_status text;
  v_new_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Historia SMS nie może być fizycznie usuwana.'
      using errcode = '55000';
  end if;

  v_old_status := lower(trim(coalesce(old.status, '')));
  v_new_status := lower(trim(coalesce(new.status, '')));

  if old.provider_message_id is not null
     and new.provider_message_id is distinct from old.provider_message_id then
    raise exception 'Identyfikator operatora SMS nie może zostać nadpisany.'
      using errcode = '55000';
  end if;

  if old.sent_at is not null and new.sent_at is null then
    raise exception 'Data wysłania SMS nie może zostać wyczyszczona.'
      using errcode = '55000';
  end if;

  if old.delivered_at is not null and new.delivered_at is null then
    raise exception 'Data doręczenia SMS nie może zostać wyczyszczona.'
      using errcode = '55000';
  end if;

  if v_new_status = 'deleted' then
    if v_old_status not in ('pending_approval', 'not_sent', 'deleted')
       or old.provider_message_id is not null
       or old.sent_at is not null
       or old.delivered_at is not null
       or new.provider_message_id is not null
       or new.sent_at is not null
       or new.delivered_at is not null then
      raise exception 'Nie można anulować rozpoczętej lub zakończonej wysyłki SMS.'
        using errcode = '55000';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_sms_log_history on public.sms_log;
create trigger trg_protect_sms_log_history
before update or delete on public.sms_log
for each row execute function public.protect_sms_log_history();

revoke all on function public.protect_sms_log_history() from public;
revoke all on function public.protect_sms_log_history() from anon;
revoke all on function public.protect_sms_log_history() from authenticated;

-- Cleanup pozostaje zgodny z dawnym API, ale w Etapie 1 niczego fizycznie nie kasuje.
create or replace function public.admin_cleanup_sms_duplicate_logs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może uruchomić kontrolę duplikatów logów SMS.'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true,
    'skipped', true,
    'reason', 'history_protection_stage1',
    'deleted_duplicate_logs', 0,
    'physical_delete_disabled', true,
    'successful_send_history_preserved', true
  );
end;
$$;

revoke all on function public.admin_cleanup_sms_duplicate_logs() from public;
revoke all on function public.admin_cleanup_sms_duplicate_logs() from anon;
grant execute on function public.admin_cleanup_sms_duplicate_logs() to authenticated;
grant execute on function public.admin_cleanup_sms_duplicate_logs() to service_role;

-- Atomowe anulowanie: tylko niewysłany log, bez claimu i bez dowodu kontaktu z operatorem.
create or replace function public.cancel_service_sms_log(
  p_log_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log public.sms_log%rowtype;
  v_status text;
  v_cycle integer;
  v_source_job text;
  v_linked_job uuid;
  v_delivery_key text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji serwerowej SMS.'
      using errcode = '42501';
  end if;

  if p_log_id is null then
    return jsonb_build_object('ok', false, 'cancelled', false, 'reason', 'missing_log_id');
  end if;

  select *
    into v_log
  from public.sms_log
  where id = p_log_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'cancelled', false, 'reason', 'not_found');
  end if;

  v_status := lower(trim(coalesce(v_log.status, '')));
  v_cycle := coalesce(v_log.reminder_cycle, 1);

  if v_status = 'deleted' then
    return jsonb_build_object(
      'ok', true,
      'cancelled', false,
      'already_deleted', true,
      'log_id', v_log.id
    );
  end if;

  if v_status not in ('pending_approval', 'not_sent')
     or v_log.provider_message_id is not null
     or v_log.sent_at is not null
     or v_log.delivered_at is not null then
    return jsonb_build_object(
      'ok', false,
      'cancelled', false,
      'reason', 'send_already_started_or_finalized',
      'status', v_log.status,
      'log_id', v_log.id
    );
  end if;

  v_linked_job := v_log.job_id;

  if v_log.device_id is not null then
    select split_part(d.source_job_id, '::', 1)
      into v_source_job
    from public.devices d
    where d.id = v_log.device_id;

    if v_source_job ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and v_linked_job is null then
      v_linked_job := v_source_job::uuid;
    end if;
  end if;

  if v_linked_job is not null then
    v_delivery_key := 'job:' || v_linked_job::text || ':cycle:' || v_cycle::text;
  elsif v_log.device_id is not null then
    v_delivery_key := 'device:' || v_log.device_id::text || ':cycle:' || v_cycle::text;
  else
    v_delivery_key := null;
  end if;

  if v_delivery_key is not null
     and exists (
       select 1
       from private.sms_delivery_claims c
       where c.delivery_key = v_delivery_key
     ) then
    return jsonb_build_object(
      'ok', false,
      'cancelled', false,
      'reason', 'send_claim_exists',
      'log_id', v_log.id
    );
  end if;

  update public.sms_log
  set
    status = 'deleted',
    approved_at = now(),
    approved_by = p_actor_id,
    error_message = null
  where id = v_log.id;

  return jsonb_build_object(
    'ok', true,
    'cancelled', true,
    'log_id', v_log.id,
    'job_id', v_linked_job,
    'device_id', v_log.device_id,
    'reminder_cycle', v_cycle
  );
end;
$$;

revoke all on function public.cancel_service_sms_log(uuid, uuid) from public;
revoke all on function public.cancel_service_sms_log(uuid, uuid) from anon;
revoke all on function public.cancel_service_sms_log(uuid, uuid) from authenticated;
grant execute on function public.cancel_service_sms_log(uuid, uuid) to service_role;

-- Usunięcie montażu/urządzenia nie może kasować sms_log.
alter table public.sms_log
  drop constraint if exists sms_log_device_id_fkey;
alter table public.sms_log
  add constraint sms_log_device_id_fkey
  foreign key (device_id) references public.devices(id) on delete set null;

alter table public.sms_log
  drop constraint if exists sms_log_job_id_fkey;
alter table public.sms_log
  add constraint sms_log_job_id_fkey
  foreign key (job_id) references public.jobs(id) on delete set null;
