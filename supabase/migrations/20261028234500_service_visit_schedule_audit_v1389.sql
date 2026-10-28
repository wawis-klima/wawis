-- WAWIS 13.89: historia zmian terminu i statusu serwisu.
create table public.service_visit_change_events (
 id bigint generated always as identity primary key,
 service_visit_id uuid not null references public.service_visits(id) on delete cascade,
 changed_at timestamptz not null default now(),
 changed_by uuid,
 old_scheduled_date date,
 new_scheduled_date date,
 old_scheduled_time time without time zone,
 new_scheduled_time time without time zone,
 old_status text not null,
 new_status text not null,
 old_notes text,
 new_notes text
);
create index service_visit_change_events_visit_idx
 on public.service_visit_change_events(service_visit_id,changed_at);
alter table public.service_visit_change_events enable row level security;
create policy service_visit_change_events_admin_read on public.service_visit_change_events
 for select to authenticated using((select public.current_user_is_admin()));
revoke all on public.service_visit_change_events from anon,authenticated;
grant select on public.service_visit_change_events to authenticated;
create or replace function public.service_visit_changes_audit_v1389()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
begin
 if old.scheduled_date is distinct from new.scheduled_date
    or old.scheduled_time is distinct from new.scheduled_time
    or old.status is distinct from new.status
    or old.notes is distinct from new.notes then
    insert into public.service_visit_change_events
    (service_visit_id,changed_by,old_scheduled_date,new_scheduled_date,
     old_scheduled_time,new_scheduled_time,old_status,new_status,old_notes,new_notes)
    values(old.id,auth.uid(),old.scheduled_date,new.scheduled_date,
     old.scheduled_time,new.scheduled_time,old.status,new.status,old.notes,new.notes);
 end if;
 return new;
end;
$fn$;
revoke all on function public.service_visit_changes_audit_v1389() from public,anon,authenticated;
create trigger trg_service_visit_changes_audit_v1389 after update on public.service_visits
 for each row execute function public.service_visit_changes_audit_v1389();
