-- WAWIS 13.94: administracyjny kosz przeglądów. Bez destrukcyjnego kasowania podpisanych PDF i zdjęć.
alter table public.service_visits
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id);
create index if not exists service_visits_active_schedule_v1394
  on public.service_visits(scheduled_date desc) where deleted_at is null;
create index if not exists service_visits_trash_v1394
  on public.service_visits(deleted_at desc) where deleted_at is not null;

create table if not exists private.service_visit_trash_audit_v1394 (
 id bigint generated always as identity primary key,
 visit_id uuid not null,
 actor_id uuid not null,
 action text not null check(action in ('trash','restore')),
 status_at_action text not null,
 created_at timestamptz not null default now()
);
revoke all on private.service_visit_trash_audit_v1394 from public,anon,authenticated;

create or replace function public.service_visit_admin_trash(p_visit_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $fn$
declare existing record;
begin
 if auth.uid() is null or not public.current_user_is_admin() then raise exception 'Tylko administrator może usunąć serwis' using errcode='42501'; end if;
 select id,status,deleted_at into existing from public.service_visits where id=p_visit_id for update;
 if not found then raise exception 'Nie znaleziono przeglądu'; end if;
 if existing.deleted_at is not null then return true; end if;
 update public.service_visits set deleted_at=now(),deleted_by=auth.uid(),updated_at=now() where id=p_visit_id;
 insert into private.service_visit_trash_audit_v1394(visit_id,actor_id,action,status_at_action)
 values(p_visit_id,auth.uid(),'trash',existing.status);
 return true;
end;
$fn$;
revoke all on function public.service_visit_admin_trash(uuid) from public,anon,authenticated;
grant execute on function public.service_visit_admin_trash(uuid) to authenticated;

create or replace function public.service_visit_admin_restore(p_visit_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $fn$
declare existing record;
begin
 if auth.uid() is null or not public.current_user_is_admin() then raise exception 'Tylko administrator może przywrócić serwis' using errcode='42501'; end if;
 select id,status,deleted_at into existing from public.service_visits where id=p_visit_id for update;
 if not found then raise exception 'Nie znaleziono przeglądu'; end if;
 if existing.deleted_at is null then return true; end if;
 update public.service_visits set deleted_at=null,deleted_by=null,updated_at=now() where id=p_visit_id;
 insert into private.service_visit_trash_audit_v1394(visit_id,actor_id,action,status_at_action)
 values(p_visit_id,auth.uid(),'restore',existing.status);
 return true;
end;
$fn$;
revoke all on function public.service_visit_admin_restore(uuid) from public,anon,authenticated;
grant execute on function public.service_visit_admin_restore(uuid) to authenticated;
-- Nowe powiadomienia nie powinny dochodzić dla wizyt przeniesionych do kosza.
create or replace function public.get_service_visit_assignment_push_event_v1393(p_event_id uuid,p_token text)
returns table(visit_id uuid,recipient_user_id uuid,assignment_event_id bigint)
language plpgsql security definer set search_path = ''
as $fn$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_only' using errcode='42501'; end if;
 return query select e.visit_id,e.recipient_user_id,e.assignment_event_id
 from private.service_visit_assignment_push_events_v1393 e
 join public.service_visits v on v.id=e.visit_id and v.status not in ('odwolany','wykonany') and v.deleted_at is null
 join public.profiles p on p.id=e.recipient_user_id and p.role in ('Pracownik','Administrator')
 where e.id=p_event_id and e.event_token=p_token and e.processed_at is null
 and (v.primary_technician_id=e.recipient_user_id or e.recipient_user_id=any(v.additional_technician_ids));
end;
$fn$;
revoke all on function public.get_service_visit_assignment_push_event_v1393(uuid,text) from public,anon,authenticated;
grant execute on function public.get_service_visit_assignment_push_event_v1393(uuid,text) to service_role;
