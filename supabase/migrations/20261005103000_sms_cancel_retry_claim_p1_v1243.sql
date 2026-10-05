-- SMS P1-01: anulowanie musi widzieć trwającą próbę retry.
-- Obie ścieżki (claim retry i cancel) blokują ten sam sms_log FOR UPDATE,
-- więc sprawdzenie aktywnego claimu po uzyskaniu blokady zamyka wyścig.

create or replace function public.cancel_service_sms_log(
  p_log_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_log public.sms_log%rowtype;
  v_status text;
  v_cycle integer;
  v_source_job text;
  v_linked_job uuid;
  v_group_delivery_key text;
  v_legacy_delivery_key text;
  v_active_claim_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji serwerowej SMS.'
      using errcode = '42501';
  end if;

  if p_log_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'cancelled', false, 'reason', 'missing_log_id');
  end if;

  select *
    into v_log
  from public.sms_log
  where id = p_log_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'cancelled', false, 'reason', 'not_found');
  end if;

  v_status := lower(btrim(coalesce(v_log.status, '')));
  v_cycle := coalesce(v_log.reminder_cycle, 1);

  if v_status in ('deleted', 'dismissed') then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'cancelled', false,
      'already_deleted', true,
      'log_id', v_log.id,
      'status', v_log.status
    );
  end if;

  v_linked_job := v_log.job_id;

  if v_log.device_id is not null then
    select pg_catalog.split_part(d.source_job_id, '::', 1)
      into v_source_job
    from public.devices d
    where d.id = v_log.device_id;

    if v_source_job ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and v_linked_job is null then
      v_linked_job := v_source_job::uuid;
    end if;
  end if;

  if v_log.reminder_group_id is not null then
    v_group_delivery_key := 'group:' || v_log.reminder_group_id::text;
  end if;

  if v_linked_job is not null then
    v_legacy_delivery_key := 'job:' || v_linked_job::text || ':cycle:' || v_cycle::text;
  elsif v_log.device_id is not null then
    v_legacy_delivery_key := 'device:' || v_log.device_id::text || ':cycle:' || v_cycle::text;
  end if;

  -- P1-01: retry używa delivery_key retry-not-sent:<log_id>, więc samo
  -- sprawdzanie klucza group:/job:/device: nie wystarczało.
  -- Sprawdzamy wszystkie aktywne claimy powiązane z tym logiem lub jego trwałą grupą.
  select c.claim_id
    into v_active_claim_id
  from private.sms_delivery_claims c
  where c.confirmed_at is null
    and (
      c.retry_of_log_id = v_log.id
      or c.source_log_id = v_log.id
      or (
        v_log.reminder_group_id is not null
        and c.reminder_group_id = v_log.reminder_group_id
      )
      or (
        v_group_delivery_key is not null
        and c.delivery_key = v_group_delivery_key
      )
      or (
        v_legacy_delivery_key is not null
        and c.delivery_key = v_legacy_delivery_key
      )
    )
  order by c.claimed_at desc
  limit 1;

  if v_active_claim_id is not null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'cancelled', false,
      'reason', 'send_claim_exists',
      'retry_in_progress', true,
      'log_id', v_log.id,
      'claim_id', v_active_claim_id
    );
  end if;

  -- Błąd po zakończonej próbie pozostaje w historii, ale może zostać
  -- usunięty z aktywnej listy dopiero gdy żadna kolejna próba nie trwa.
  if v_status = 'error' then
    update public.sms_log
    set
      status = 'dismissed',
      approved_at = now(),
      approved_by = p_actor_id
    where id = v_log.id;

    return pg_catalog.jsonb_build_object(
      'ok', true,
      'cancelled', true,
      'dismissed', true,
      'log_id', v_log.id,
      'job_id', v_log.job_id,
      'device_id', v_log.device_id,
      'reminder_cycle', v_cycle,
      'reminder_group_id', v_log.reminder_group_id
    );
  end if;

  if v_status not in ('pending_approval', 'not_sent')
     or v_log.provider_message_id is not null
     or v_log.sent_at is not null
     or v_log.delivered_at is not null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'cancelled', false,
      'reason', 'send_already_started_or_finalized',
      'status', v_log.status,
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

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'cancelled', true,
    'log_id', v_log.id,
    'job_id', v_linked_job,
    'device_id', v_log.device_id,
    'reminder_cycle', v_cycle,
    'reminder_group_id', v_log.reminder_group_id
  );
end;
$function$;

revoke all on function public.cancel_service_sms_log(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_service_sms_log(uuid, uuid) to service_role;
