-- WAWIS 12.68 — authoritative assignment epochs and atomic per-subscription PUSH event claims.
-- A failed/uncertain provider response remains claimed: at-most-once, no accidental duplicate.
alter table public.jobs add column if not exists push_assignment_epoch bigint not null default 0;

create or replace function private.bump_job_assignment_epoch_v1268()
returns trigger language plpgsql security invoker set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.push_assignment_epoch :=
      case when new.main_technician_id is not null
        or coalesce(cardinality(new.installer_ids),0) > 0 then 1 else 0 end;
  elsif new.main_technician_id is distinct from old.main_technician_id
       or new.installer_ids is distinct from old.installer_ids then
    new.push_assignment_epoch := old.push_assignment_epoch + 1;
  else
    new.push_assignment_epoch := old.push_assignment_epoch;
  end if;
  return new;
end
$function$;

drop trigger if exists trg_jobs_assignment_epoch_v1268 on public.jobs;
create trigger trg_jobs_assignment_epoch_v1268
before insert or update on public.jobs
for each row execute function private.bump_job_assignment_epoch_v1268();

create table if not exists private.push_dispatch_claims_v1268 (
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  recipient_user_id uuid not null,
  event_key text not null check (char_length(event_key) between 1 and 300),
  claimed_at timestamptz not null default now(),
  primary key(subscription_id, event_key)
);
revoke all on private.push_dispatch_claims_v1268 from public, anon, authenticated;
alter table private.push_dispatch_claims_v1268 enable row level security;

create or replace function public.push_claim_delivery_v1268(
  p_subscription_id uuid, p_recipient_user_id uuid, p_event_key text
)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare
  v_claimed uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'push_claim_service_only' using errcode='42501';
  end if;
  if p_subscription_id is null or p_recipient_user_id is null
     or p_event_key is null or length(btrim(p_event_key)) < 1 or length(p_event_key) > 300 then
    raise exception 'push_claim_invalid' using errcode='22023';
  end if;
  -- The database, not the request body, determines who currently owns the endpoint.
  insert into private.push_dispatch_claims_v1268 (subscription_id, recipient_user_id, event_key)
    select s.id,s.user_id,p_event_key
    from public.push_subscriptions s
    where s.id=p_subscription_id
      and s.user_id=p_recipient_user_id
      and s.is_active=true
  on conflict(subscription_id,event_key) do nothing
  returning subscription_id into v_claimed;
  return v_claimed is not null;
end
$function$;
revoke all on function public.push_claim_delivery_v1268(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.push_claim_delivery_v1268(uuid,uuid,text) to service_role;
comment on function public.push_claim_delivery_v1268(uuid,uuid,text) is
  '12.68: atomowo rezerwuje zdarzenie PUSH dla aktywnej subskrypcji, bez dostępu zwykłych użytkowników';
