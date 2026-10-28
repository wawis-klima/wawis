-- WAWIS 13.89: niezależny, trwały PUSH do administratora po podpisanym i zakończonym przeglądzie.
create extension if not exists pg_net with schema extensions;
create table private.service_visit_completed_push_events_v1389 (
 id uuid primary key default gen_random_uuid(),
 visit_id uuid not null unique references public.service_visits(id) on delete cascade,
 protocol_id uuid not null references public.service_visit_protocols(id),
 completed_at timestamptz not null,
 actor_id uuid,
 event_token text not null check(length(event_token)=64),
 created_at timestamptz not null default now(),
 last_dispatched_at timestamptz,
 processed_at timestamptz
);
revoke all on private.service_visit_completed_push_events_v1389 from public,anon,authenticated;
create index service_visit_completed_push_pending_v1389
 on private.service_visit_completed_push_events_v1389(last_dispatched_at,created_at) where processed_at is null;

create or replace function public.get_service_visit_completed_push_event_v1389(p_event_id uuid,p_token text)
returns table(visit_id uuid,protocol_id uuid,completed_at timestamptz,actor_id uuid)
language plpgsql security definer set search_path = ''
as $fn$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_only' using errcode='42501'; end if;
 return query select e.visit_id,e.protocol_id,e.completed_at,e.actor_id
   from private.service_visit_completed_push_events_v1389 e
   join public.service_visits v on v.id=e.visit_id and v.status='wykonany'
   join public.service_visit_protocols p on p.id=e.protocol_id and p.service_visit_id=e.visit_id
   where e.id=p_event_id and e.event_token=p_token and e.processed_at is null;
end;
$fn$;
revoke all on function public.get_service_visit_completed_push_event_v1389(uuid,text) from public,anon,authenticated;
grant execute on function public.get_service_visit_completed_push_event_v1389(uuid,text) to service_role;

create or replace function public.mark_service_visit_completed_push_event_v1389(p_event_id uuid,p_token text)
returns boolean language plpgsql security definer set search_path = ''
as $fn$
declare changed boolean := false;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_only' using errcode='42501'; end if;
 update private.service_visit_completed_push_events_v1389
 set processed_at=coalesce(processed_at,now()) where id=p_event_id and event_token=p_token
 returning true into changed;
 return coalesce(changed,false);
end;
$fn$;
revoke all on function public.mark_service_visit_completed_push_event_v1389(uuid,text) from public,anon,authenticated;
grant execute on function public.mark_service_visit_completed_push_event_v1389(uuid,text) to service_role;

create or replace function private.dispatch_service_visit_completed_push_v1389(p_event_id uuid)
returns void language plpgsql security definer set search_path = ''
as $fn$
declare e record;
begin
 select id,event_token,processed_at into e from private.service_visit_completed_push_events_v1389 where id=p_event_id;
 if not found or e.processed_at is not null then return; end if;
 perform net.http_post(
 url => 'https://uohziyaudbpwmupvljyd.supabase.co/functions/v1/send-service-visit-completed-push',
 body => jsonb_build_object('eventType','service_visit_completed_webhook','eventId',e.id,'token',e.event_token),
 headers => '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds => 10000);
 update private.service_visit_completed_push_events_v1389 set last_dispatched_at=now() where id=p_event_id and processed_at is null;
end;
$fn$;
revoke all on function private.dispatch_service_visit_completed_push_v1389(uuid) from public,anon,authenticated;

create or replace function private.enqueue_service_visit_completed_push_v1389()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
declare created_event uuid; signed_protocol uuid;
begin
 if new.status<>'wykonany' or old.status='wykonany' then return new; end if;
 select p.id into signed_protocol from public.service_visit_protocols p
   where p.service_visit_id=new.id and p.signed_at is not null and nullif(p.signature_path,'') is not null;
 if signed_protocol is null then return new; end if;
 insert into private.service_visit_completed_push_events_v1389
 (visit_id,protocol_id,completed_at,actor_id,event_token)
 values(new.id,signed_protocol,new.completed_at,auth.uid(),encode(extensions.gen_random_bytes(32),'hex'))
 on conflict(visit_id) do nothing returning id into created_event;
 if created_event is not null then
   begin
     perform private.dispatch_service_visit_completed_push_v1389(created_event);
   exception when others then
     raise warning 'service push queued: %',sqlerrm;
   end;
 end if;
 return new;
end;
$fn$;
revoke all on function private.enqueue_service_visit_completed_push_v1389() from public,anon,authenticated;
create trigger trg_service_visit_completed_push_v1389 after update of status on public.service_visits
 for each row execute function private.enqueue_service_visit_completed_push_v1389();

create or replace function private.retry_service_visit_completed_push_v1389()
returns integer language plpgsql security definer set search_path = ''
as $fn$
declare e record; attempts integer := 0;
begin
 for e in select id from private.service_visit_completed_push_events_v1389
 where processed_at is null and created_at > now()-interval '48 hours'
 and (last_dispatched_at is null or last_dispatched_at < now()-interval '3 minutes')
 order by created_at limit 25 loop
   begin
     perform private.dispatch_service_visit_completed_push_v1389(e.id);
     attempts := attempts + 1;
   exception when others then raise warning 'service push retry failed: %',sqlerrm;
   end;
 end loop;
 return attempts;
end;
$fn$;
revoke all on function private.retry_service_visit_completed_push_v1389() from public,anon,authenticated;
do $block$
begin
 if not exists(select 1 from cron.job where jobname='wawis-service-visit-completed-push-v1389') then
  perform cron.schedule('wawis-service-visit-completed-push-v1389','*/3 * * * *',
   'select private.retry_service_visit_completed_push_v1389();');
 end if;
end
$block$;
