
-- WAWIS 13.30: server-originated PUSH after saving the first signed protocol.
-- No worker UI changes, no notification on drafts or on re-signing.
create extension if not exists pg_net with schema extensions;
create table if not exists private.protocol_signed_push_events_v1330 (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  protocol_id uuid not null references public.job_protocols(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  signed_at timestamptz not null,
  event_token text not null,
  created_at timestamptz not null default now(),
  last_dispatched_at timestamptz,
  processed_at timestamptz,
  constraint protocol_signed_push_token_length_v1330 check (length(event_token) = 64)
);
revoke all on private.protocol_signed_push_events_v1330 from public, anon, authenticated;
create index if not exists protocol_signed_push_pending_v1330
 on private.protocol_signed_push_events_v1330 (last_dispatched_at, created_at)
 where processed_at is null;

create or replace function public.get_protocol_signed_push_event_v1330(p_event_id uuid, p_token text)
returns table (job_id uuid, protocol_id uuid, created_by uuid, signed_at timestamptz)
language plpgsql security definer set search_path = ''
as $fn$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'protocol_push_service_only' using errcode='42501';
  end if;
  return query
    select e.job_id, e.protocol_id, e.created_by, e.signed_at
    from private.protocol_signed_push_events_v1330 e
    join public.job_protocols p on p.id = e.protocol_id and p.job_id = e.job_id
    where e.id = p_event_id and e.event_token = p_token and e.processed_at is null
      and p.signed_at is not null and nullif(btrim(p.signature_path), '') is not null;
end;
$fn$;
revoke all on function public.get_protocol_signed_push_event_v1330(uuid,text) from public, anon, authenticated;
grant execute on function public.get_protocol_signed_push_event_v1330(uuid,text) to service_role;

create or replace function public.mark_protocol_signed_push_event_v1330(p_event_id uuid, p_token text)
returns boolean
language plpgsql security definer set search_path = ''
as $fn$
declare changed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'protocol_push_service_only' using errcode='42501';
  end if;
  update private.protocol_signed_push_events_v1330
     set processed_at = coalesce(processed_at, now())
   where id = p_event_id and event_token = p_token
   returning true into changed;
  return coalesce(changed,false);
end;
$fn$;
revoke all on function public.mark_protocol_signed_push_event_v1330(uuid,text) from public, anon, authenticated;
grant execute on function public.mark_protocol_signed_push_event_v1330(uuid,text) to service_role;

create or replace function private.dispatch_protocol_signed_push_event_v1330(p_event_id uuid)
returns void language plpgsql security definer set search_path = ''
as $fn$
declare e record;
begin
  select id, event_token, processed_at into e
  from private.protocol_signed_push_events_v1330 where id=p_event_id;
  if not found or e.processed_at is not null then return; end if;
  perform net.http_post(
     url => 'https://uohziyaudbpwmupvljyd.supabase.co/functions/v1/send-protocol-signed-push',
     body => jsonb_build_object('eventType','job_protocol_signed_webhook', 'eventId',e.id, 'token',e.event_token),
     headers => '{"Content-Type":"application/json"}'::jsonb,
     timeout_milliseconds => 10000
  );
  update private.protocol_signed_push_events_v1330
     set last_dispatched_at = now()
   where id=p_event_id and processed_at is null;
end;
$fn$;
revoke all on function private.dispatch_protocol_signed_push_event_v1330(uuid) from public, anon, authenticated;

create or replace function private.notify_protocol_signed_push_v1330()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
declare inserted_event uuid;
begin
  if new.signed_at is null or nullif(btrim(new.signature_path), '') is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if nullif(btrim(old.signature_path), '') is not null then return new; end if;
  end if;
  insert into private.protocol_signed_push_events_v1330
       (job_id, protocol_id, created_by, signed_at, event_token)
  values (new.job_id, new.id, new.created_by, new.signed_at, encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict(job_id) do nothing
  returning id into inserted_event;
  if inserted_event is not null then
    begin
      perform private.dispatch_protocol_signed_push_event_v1330(inserted_event);
    exception when others then
      raise warning 'WAWIS protocol signed push queued for retry: %', sqlerrm;
    end;
  end if;
  return new;
end;
$fn$;
revoke all on function private.notify_protocol_signed_push_v1330() from public, anon, authenticated;
drop trigger if exists trg_protocol_signed_push_v1330 on public.job_protocols;
create trigger trg_protocol_signed_push_v1330
after insert or update of signature_path on public.job_protocols
for each row
execute function private.notify_protocol_signed_push_v1330();

create or replace function private.retry_protocol_signed_push_events_v1330()
returns integer language plpgsql security definer set search_path = ''
as $fn$
declare e record; attempts integer := 0;
begin
  for e in
    select id from private.protocol_signed_push_events_v1330
    where processed_at is null
      and created_at > now()-interval '48 hours'
      and (last_dispatched_at is null or last_dispatched_at < now()-interval '3 minutes')
    order by created_at asc limit 25
  loop
    begin
      perform private.dispatch_protocol_signed_push_event_v1330(e.id);
      attempts := attempts+1;
    exception when others then
      raise warning 'WAWIS protocol push retry failed: %', sqlerrm;
    end;
  end loop;
  return attempts;
end;
$fn$;
revoke all on function private.retry_protocol_signed_push_events_v1330() from public, anon, authenticated;

do $block$
begin
  if not exists(select 1 from cron.job where jobname = 'wawis-protocol-signed-push-retry-v1330') then
    perform cron.schedule(
      'wawis-protocol-signed-push-retry-v1330',
      '*/3 * * * *',
      'select private.retry_protocol_signed_push_events_v1330();'
    );
  end if;
end
$block$;

