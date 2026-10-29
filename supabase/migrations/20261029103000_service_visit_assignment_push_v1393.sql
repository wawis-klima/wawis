-- WAWIS 13.93: trwałe powiadomienie PUSH wyłącznie dla NOWO przydzielonych serwisantów.
-- Osobne od zakończenia serwisu, SMS i montaży; nie modyfikuje istniejących danych.
create table if not exists private.service_visit_assignment_push_events_v1393 (
 id uuid primary key default gen_random_uuid(),
 assignment_event_id bigint not null references public.service_visit_assignment_events(id) on delete cascade,
 visit_id uuid not null references public.service_visits(id) on delete cascade,
 recipient_user_id uuid not null references public.profiles(id) on delete cascade,
 event_token text not null check(length(event_token)=64),
 created_at timestamptz not null default now(),
 last_dispatched_at timestamptz,
 processed_at timestamptz,
 unique(assignment_event_id,recipient_user_id)
);
revoke all on private.service_visit_assignment_push_events_v1393 from public,anon,authenticated;
create index if not exists service_visit_assignment_push_pending_v1393
 on private.service_visit_assignment_push_events_v1393(last_dispatched_at,created_at) where processed_at is null;

create or replace function public.get_service_visit_assignment_push_event_v1393(p_event_id uuid,p_token text)
returns table(visit_id uuid,recipient_user_id uuid,assignment_event_id bigint)
language plpgsql security definer set search_path = ''
as $fn$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_only' using errcode='42501'; end if;
 return query select e.visit_id,e.recipient_user_id,e.assignment_event_id
 from private.service_visit_assignment_push_events_v1393 e
 join public.service_visits v on v.id=e.visit_id and v.status not in ('odwolany','wykonany')
 join public.profiles p on p.id=e.recipient_user_id and p.role in ('Pracownik','Administrator')
 where e.id=p_event_id and e.event_token=p_token and e.processed_at is null
 and (v.primary_technician_id=e.recipient_user_id or e.recipient_user_id=any(v.additional_technician_ids));
end;
$fn$;
revoke all on function public.get_service_visit_assignment_push_event_v1393(uuid,text) from public,anon,authenticated;
grant execute on function public.get_service_visit_assignment_push_event_v1393(uuid,text) to service_role;

create or replace function public.mark_service_visit_assignment_push_event_v1393(p_event_id uuid,p_token text)
returns boolean language plpgsql security definer set search_path = ''
as $fn$
declare changed boolean := false;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_only' using errcode='42501'; end if;
 update private.service_visit_assignment_push_events_v1393
 set processed_at=coalesce(processed_at,now()) where id=p_event_id and event_token=p_token
 returning true into changed;
 return coalesce(changed,false);
end;
$fn$;
revoke all on function public.mark_service_visit_assignment_push_event_v1393(uuid,text) from public,anon,authenticated;
grant execute on function public.mark_service_visit_assignment_push_event_v1393(uuid,text) to service_role;

create or replace function private.dispatch_service_visit_assignment_push_v1393(p_event_id uuid)
returns void language plpgsql security definer set search_path = ''
as $fn$
declare e record;
begin
 select id,event_token,processed_at into e from private.service_visit_assignment_push_events_v1393 where id=p_event_id;
 if not found or e.processed_at is not null then return; end if;
 perform net.http_post(
 url => 'https://uohziyaudbpwmupvljyd.supabase.co/functions/v1/send-service-visit-assignment-push',
 body => jsonb_build_object('eventType','service_visit_assignment_webhook','eventId',e.id,'token',e.event_token),
 headers => '{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds => 10000);
 update private.service_visit_assignment_push_events_v1393
 set last_dispatched_at=now() where id=p_event_id and processed_at is null;
end;
$fn$;
revoke all on function private.dispatch_service_visit_assignment_push_v1393(uuid) from public,anon,authenticated;

create or replace function private.enqueue_service_visit_assignment_push_v1393()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
declare old_ids uuid[]; new_ids uuid[]; recipient uuid; queued uuid;
begin
 old_ids:=array_remove(array_cat(array[new.old_primary_technician_id],new.old_additional_technician_ids),null);
 new_ids:=array_remove(array_cat(array[new.new_primary_technician_id],new.new_additional_technician_ids),null);
 for recipient in select distinct u.id from unnest(new_ids) as u(id)
  join public.profiles p on p.id=u.id and p.role in ('Pracownik','Administrator')
  where not (u.id=any(old_ids)) loop
   insert into private.service_visit_assignment_push_events_v1393
    (assignment_event_id,visit_id,recipient_user_id,event_token)
    values(new.id,new.service_visit_id,recipient,encode(extensions.gen_random_bytes(32),'hex'))
    on conflict(assignment_event_id,recipient_user_id) do nothing returning id into queued;
   if queued is not null then
    begin
     perform private.dispatch_service_visit_assignment_push_v1393(queued);
    exception when others then raise warning 'service assignment push queued: %',sqlerrm;
    end;
   end if;
   queued:=null;
 end loop;
 return new;
end;
$fn$;
revoke all on function private.enqueue_service_visit_assignment_push_v1393() from public,anon,authenticated;
drop trigger if exists trg_service_visit_assignment_push_v1393 on public.service_visit_assignment_events;
create trigger trg_service_visit_assignment_push_v1393
 after insert on public.service_visit_assignment_events
 for each row execute function private.enqueue_service_visit_assignment_push_v1393();

create or replace function private.retry_service_visit_assignment_push_v1393()
returns integer language plpgsql security definer set search_path = ''
as $fn$
declare e record; attempts integer:=0;
begin
 for e in select id from private.service_visit_assignment_push_events_v1393
 where processed_at is null and created_at>now()-interval '48 hours'
 and (last_dispatched_at is null or last_dispatched_at<now()-interval '3 minutes')
 order by created_at limit 25 loop
  begin
   perform private.dispatch_service_visit_assignment_push_v1393(e.id);
   attempts:=attempts+1;
  exception when others then raise warning 'assignment push retry failed: %',sqlerrm;
  end;
 end loop;
 return attempts;
end;
$fn$;
revoke all on function private.retry_service_visit_assignment_push_v1393() from public,anon,authenticated;
do $block$
begin
 if not exists(select 1 from cron.job where jobname='wawis-service-visit-assignment-push-v1393') then
  perform cron.schedule('wawis-service-visit-assignment-push-v1393','*/3 * * * *',
   'select private.retry_service_visit_assignment_push_v1393();');
 end if;
end
$block$;
