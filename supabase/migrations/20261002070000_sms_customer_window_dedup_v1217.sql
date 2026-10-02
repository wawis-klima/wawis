-- v12.17: jeden SMS dla klienta, gdy aktywne terminy serwisu jego urządzeń wpadają w to samo 62-dniowe okno.
-- Zachowujemy faktyczne wysyłki (sent/provider_sent/delivered), a usuwamy tylko zbędne wpisy techniczne
-- typu oczekujący/anulowany/błąd/niewysłany, jeśli w tym samym oknie istnieje lepszy kanoniczny wpis.

create or replace function public.admin_cleanup_sms_duplicate_logs()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może czyścić duplikaty logów SMS.' using errcode = '42501';
  end if;

  with normalized as (
    select
      l.id,
      l.status,
      l.reminder_due_date,
      l.created_at,
      case
        when regexp_replace(coalesce(l.phone, ''), '\D', '', 'g') <> '' then
          'phone:' ||
          case
            when length(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g')) = 9
              then '48' || regexp_replace(coalesce(l.phone, ''), '\D', '', 'g')
            else regexp_replace(coalesce(l.phone, ''), '\D', '', 'g')
          end
        else
          'client:' || lower(regexp_replace(trim(coalesce(l.client, '')), '\s+', ' ', 'g'))
      end as customer_key,
      case lower(trim(coalesce(l.status, '')))
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
    where l.sms_type = 'service_reminder'
      and l.reminder_due_date is not null
  ),
  duplicates as (
    select loser.id
    from normalized loser
    where lower(trim(coalesce(loser.status, ''))) not in ('delivered', 'provider_sent', 'sent')
      and exists (
        select 1
        from normalized winner
        where winner.id <> loser.id
          and winner.customer_key = loser.customer_key
          and loser.customer_key not in ('client:', 'phone:')
          and abs(winner.reminder_due_date - loser.reminder_due_date) <= 62
          and (
            winner.status_rank < loser.status_rank
            or (
              winner.status_rank = loser.status_rank
              and (
                winner.reminder_due_date < loser.reminder_due_date
                or (
                  winner.reminder_due_date = loser.reminder_due_date
                  and (
                    winner.created_at < loser.created_at
                    or (winner.created_at = loser.created_at and winner.id::text < loser.id::text)
                  )
                )
              )
            )
          )
      )
  ),
  deleted as (
    delete from public.sms_log l
    using duplicates d
    where l.id = d.id
    returning l.id
  )
  select count(*) into v_deleted_count from deleted;

  return jsonb_build_object(
    'ok', true,
    'deleted_duplicate_logs', coalesce(v_deleted_count, 0),
    'customer_window_days', 62,
    'successful_send_history_preserved', true
  );
end;
$$;

revoke all on function public.admin_cleanup_sms_duplicate_logs() from public;
revoke all on function public.admin_cleanup_sms_duplicate_logs() from anon;
grant execute on function public.admin_cleanup_sms_duplicate_logs() to authenticated;
grant execute on function public.admin_cleanup_sms_duplicate_logs() to service_role;
