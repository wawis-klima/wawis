-- Moduł SMS etap 9: czyszczenie historycznych duplikatów logów SMS po grupowaniu urządzeń z jednego montażu.
-- Bezpieczna procedura administracyjna zostawia jeden kanoniczny log dla montażu i cyklu przypomnienia,
-- a usuwa stare osobne wpisy urządzeń utworzone przed wersją 7.62.

create or replace function public.admin_cleanup_sms_duplicate_logs()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer := 0;
  v_canonical_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może czyścić duplikaty logów SMS.' using errcode = '42501';
  end if;

  -- Grupujemy stare logi po montażu i cyklu, a nie po urządzeniu. Dzięki temu dwa lub trzy
  -- urządzenia z tego samego zlecenia zostawiają tylko jeden wpis historii/kolejki SMS.
  with linked_logs as (
    select
      l.id,
      coalesce(d.source_job_id, l.job_id) as group_job_id,
      coalesce(l.reminder_cycle, 1) as normalized_cycle,
      l.reminder_due_date,
      l.status,
      l.created_at,
      l.approved_at,
      l.sent_at,
      l.delivered_at,
      l.device_id,
      l.job_id,
      l.provider_message_id,
      case lower(coalesce(l.status, ''))
        when 'delivered' then 1
        when 'provider_sent' then 2
        when 'sent' then 3
        when 'pending_approval' then 4
        when 'approved' then 5
        when 'error' then 6
        when 'not_sent' then 7
        when 'deleted' then 8
        else 9
      end as status_rank
    from public.sms_log l
    left join public.devices d on d.id = l.device_id
    where l.sms_type = 'service_reminder'
      and coalesce(d.source_job_id, l.job_id) is not null
      and (l.device_id is not null or l.job_id is not null)
  ), ranked as (
    select
      linked_logs.*,
      row_number() over (
        partition by group_job_id, normalized_cycle
        order by
          status_rank asc,
          coalesce(delivered_at, sent_at, approved_at, created_at) desc nulls last,
          id asc
      ) as rn,
      min(reminder_due_date) over (partition by group_job_id, normalized_cycle) as group_due_date,
      count(*) over (partition by group_job_id, normalized_cycle) as group_count
    from linked_logs
    where group_job_id is not null
  ), duplicates as (
    select id
    from ranked
    where group_count > 1
      and rn > 1
  ), deleted as (
    delete from public.sms_log l
    using duplicates d
    where l.id = d.id
    returning l.id
  ), canonical as (
    select id, group_job_id, normalized_cycle, group_due_date
    from ranked
    where group_count > 1
      and rn = 1
  ), updated as (
    update public.sms_log l
    set
      job_id = canonical.group_job_id,
      device_id = null,
      reminder_cycle = canonical.normalized_cycle,
      reminder_due_date = coalesce(l.reminder_due_date, canonical.group_due_date)
    from canonical
    where l.id = canonical.id
      and (
        l.job_id is distinct from canonical.group_job_id
        or l.device_id is not null
        or l.reminder_cycle is distinct from canonical.normalized_cycle
        or (l.reminder_due_date is null and canonical.group_due_date is not null)
      )
    returning l.id
  )
  select
    (select count(*) from deleted),
    (select count(*) from updated)
  into v_deleted_count, v_canonical_count;

  return jsonb_build_object(
    'ok', true,
    'deleted_duplicate_logs', coalesce(v_deleted_count, 0),
    'canonicalized_logs', coalesce(v_canonical_count, 0)
  );
end;
$$;

grant execute on function public.admin_cleanup_sms_duplicate_logs() to authenticated;
