-- A04: competing request keys cannot claim the same still-uncertain PDF delivery.
alter table public.job_protocol_email_log add column if not exists protocol_storage_path text;
alter table public.job_protocol_email_log add column if not exists protocol_signed_at timestamptz;
create unique index if not exists protocol_email_pending_version
on public.job_protocol_email_log(sent_by, protocol_id, recipient_email, protocol_storage_path)
where status='sending' and protocol_storage_path is not null;

-- A05: preserve the actual send identity independently of callback timestamps.
alter table public.jobs add column if not exists last_sms_log_id uuid;
update public.jobs j set last_sms_log_id=(select l.id from public.sms_log l where l.job_id=j.id order by l.created_at desc,l.id desc limit 1)
where j.last_sms_log_id is null;
create or replace function private.remember_job_sms_send()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.job_id is not null then
    update public.jobs j set last_sms_log_id=new.id where j.id=new.job_id and (
      j.last_sms_log_id is null or j.last_sms_log_id=new.id or not exists(
        select 1 from public.sms_log l where l.id=j.last_sms_log_id and l.created_at>new.created_at
      )
    );
  end if;
  return new;
end;$$;
revoke all on function private.remember_job_sms_send() from public,anon,authenticated;
drop trigger if exists remember_job_sms_send on public.sms_log;
create trigger remember_job_sms_send after insert or update of provider_message_id,sent_at on public.sms_log
for each row execute function private.remember_job_sms_send();

create or replace function private.sms_delivery_rank(p_status text)
returns integer language sql immutable set search_path='' as $$
select case lower(coalesce(p_status,'')) when 'provider_sent' then 1 when 'sent' then 1 when 'error' then 2 when 'delivered' then 3 when 'deleted' then 4 else 0 end
$$;
revoke all on function private.sms_delivery_rank(text) from public,anon,authenticated;

create or replace function public.apply_sms_delivery_atomic(p_provider_message_id text,p_status text,p_error text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.sms_log%rowtype; j public.jobs%rowtype; n integer;
begin
  if p_status not in ('provider_sent','error','delivered') then raise exception 'invalid_sms_status' using errcode='22023'; end if;
  select * into l from public.sms_log where provider_message_id=p_provider_message_id order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok',false,'status',404,'error','sms_log_not_found'); end if;
  n := private.sms_delivery_rank(p_status);
  if n > private.sms_delivery_rank(l.status) then
    update public.sms_log set status=p_status,error_message=case when p_status='error' then p_error else null end,
      delivered_at=case when p_status='delivered' then now() else delivered_at end where id=l.id;
  end if;
  if l.job_id is not null then
    select * into j from public.jobs where id=l.job_id for update;
    if found and j.last_sms_log_id=l.id and n>private.sms_delivery_rank(j.last_sms_status) then
      update public.jobs set last_sms_status=p_status,last_sms_error=case when p_status='error' then p_error else null end where id=j.id;
    end if;
  end if;
  return jsonb_build_object('ok',true,'providerMessageId',p_provider_message_id,'nextStatus',p_status);
end;$$;
revoke all on function public.apply_sms_delivery_atomic(text,text,text) from public,anon,authenticated;
grant execute on function public.apply_sms_delivery_atomic(text,text,text) to service_role;
