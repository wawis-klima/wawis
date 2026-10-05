
create table if not exists private.sms_reminder_group_members (
  id uuid primary key default gen_random_uuid(),
  reminder_group_id uuid not null
    references private.sms_reminder_groups(id) on delete cascade,
  device_id uuid,
  job_id uuid,
  contractor_id uuid,
  reminder_due_date date not null,
  membership_source text not null default 'runtime',
  created_at timestamptz not null default now(),
  constraint sms_reminder_group_members_identity_check
    check (device_id is not null or job_id is not null)
);

alter table private.sms_reminder_group_members enable row level security;
revoke all on table private.sms_reminder_group_members from public, anon, authenticated;

create unique index if not exists uq_sms_reminder_group_members_device
  on private.sms_reminder_group_members(reminder_group_id, device_id)
  where device_id is not null;

create unique index if not exists uq_sms_reminder_group_members_job_only
  on private.sms_reminder_group_members(reminder_group_id, job_id)
  where device_id is null and job_id is not null;

create index if not exists idx_sms_reminder_group_members_job
  on private.sms_reminder_group_members(job_id)
  where job_id is not null;

create index if not exists idx_sms_reminder_group_members_contractor
  on private.sms_reminder_group_members(contractor_id, reminder_group_id)
  where contractor_id is not null;

create or replace function private.record_sms_reminder_group_member(
  p_group_id uuid,
  p_device_id uuid,
  p_job_id uuid,
  p_due_date date,
  p_source text default 'runtime'
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_job_id uuid := p_job_id;
  v_device_job_id uuid;
  v_contractor_id uuid;
  v_job_contractor_id uuid;
  v_source text := nullif(btrim(coalesce(p_source,'')),'');
begin
  if p_group_id is null or p_due_date is null then
    raise exception 'Brak grupy lub terminu przypomnienia dla członkostwa SMS.'
      using errcode='22023';
  end if;

  if p_device_id is null and v_job_id is null then
    raise exception 'Brak urządzenia lub karty dla członkostwa grupy SMS.'
      using errcode='22023';
  end if;

  if p_device_id is not null then
    select d.contractor_id, private.sms_source_job_uuid(d.source_job_id)
      into v_contractor_id, v_device_job_id
    from public.devices d
    where d.id=p_device_id;

    if not found then
      raise exception 'Urządzenie członkostwa grupy SMS nie istnieje.'
        using errcode='23503';
    end if;

    if v_job_id is not null
       and v_device_job_id is not null
       and v_job_id <> v_device_job_id then
      raise exception 'Niezgodne powiązanie urządzenia i karty dla grupy SMS.'
        using errcode='23514';
    end if;

    v_job_id := coalesce(v_job_id, v_device_job_id);
  end if;

  if v_job_id is not null then
    select j.contractor_id
      into v_job_contractor_id
    from public.jobs j
    where j.id=v_job_id;

    if found and v_contractor_id is null then
      v_contractor_id := v_job_contractor_id;
    end if;
  end if;

  if p_device_id is not null then
    insert into private.sms_reminder_group_members as m (
      reminder_group_id,device_id,job_id,contractor_id,reminder_due_date,membership_source
    )
    values (
      p_group_id,p_device_id,v_job_id,v_contractor_id,p_due_date,coalesce(v_source,'runtime')
    )
    on conflict (reminder_group_id,device_id) where device_id is not null
    do update set
      job_id=coalesce(m.job_id,excluded.job_id),
      contractor_id=coalesce(m.contractor_id,excluded.contractor_id);
  else
    insert into private.sms_reminder_group_members as m (
      reminder_group_id,device_id,job_id,contractor_id,reminder_due_date,membership_source
    )
    values (
      p_group_id,null,v_job_id,v_contractor_id,p_due_date,coalesce(v_source,'runtime')
    )
    on conflict (reminder_group_id,job_id) where device_id is null and job_id is not null
    do update set
      contractor_id=coalesce(m.contractor_id,excluded.contractor_id);
  end if;
end;
$function$;

revoke all on function private.record_sms_reminder_group_member(uuid,uuid,uuid,date,text)
  from public, anon, authenticated;

create or replace function public.ensure_service_sms_group_v2(
  p_phone text,
  p_due_date date,
  p_device_id uuid,
  p_job_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_group_id uuid;
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji serwerowej SMS.'
      using errcode='42501';
  end if;

  v_group_id := private.ensure_sms_reminder_group(p_phone,p_due_date);

  perform private.record_sms_reminder_group_member(
    v_group_id,p_device_id,p_job_id,p_due_date,'generator'
  );

  return v_group_id;
end;
$function$;

revoke all on function public.ensure_service_sms_group_v2(text,date,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.ensure_service_sms_group_v2(text,date,uuid,uuid)
  to service_role;

create or replace function private.capture_sms_claim_group_membership()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.reminder_group_id is not null
     and new.reminder_due_date is not null
     and (new.device_id is not null or new.job_id is not null) then
    perform private.record_sms_reminder_group_member(
      new.reminder_group_id,
      new.device_id,
      new.job_id,
      new.reminder_due_date,
      'claim'
    );
  end if;
  return new;
end;
$function$;

revoke all on function private.capture_sms_claim_group_membership()
  from public, anon, authenticated;

drop trigger if exists trg_capture_sms_claim_group_membership
  on private.sms_delivery_claims;

create trigger trg_capture_sms_claim_group_membership
after insert or update of reminder_group_id,device_id,job_id,reminder_due_date
on private.sms_delivery_claims
for each row
execute function private.capture_sms_claim_group_membership();

insert into private.sms_reminder_group_members (
  reminder_group_id,device_id,job_id,contractor_id,reminder_due_date,membership_source
)
select
  l.reminder_group_id,
  l.device_id,
  l.job_id,
  coalesce(d.contractor_id,j.contractor_id),
  coalesce(l.reminder_due_date,g.anchor_due_date),
  'log_backfill'
from public.sms_log l
join private.sms_reminder_groups g on g.id=l.reminder_group_id
left join public.devices d on d.id=l.device_id
left join public.jobs j on j.id=l.job_id
where l.reminder_group_id is not null
  and (l.device_id is not null or l.job_id is not null)
on conflict do nothing;

with group_contractors as (
  select distinct
    l.reminder_group_id,
    coalesce(d.contractor_id,j.contractor_id) as contractor_id,
    g.anchor_due_date,
    g.window_end_date
  from public.sms_log l
  join private.sms_reminder_groups g on g.id=l.reminder_group_id
  left join public.devices d on d.id=l.device_id
  left join public.jobs j on j.id=l.job_id
  where l.reminder_group_id is not null
    and coalesce(d.contractor_id,j.contractor_id) is not null
),
candidate_members as (
  select
    gc.reminder_group_id,
    d.id as device_id,
    private.sms_source_job_uuid(d.source_job_id) as job_id,
    gc.contractor_id,
    private.service_sms_due_date(d.installation_date,gs.cycle) as reminder_due_date
  from group_contractors gc
  join public.devices d on d.contractor_id=gc.contractor_id
  left join public.jobs j on j.id=private.sms_source_job_uuid(d.source_job_id)
  cross join lateral generate_series(
    1,
    greatest(1,coalesce(j.service_reminder_years,d.service_reminder_years,5))
  ) as gs(cycle)
  where d.installation_date is not null
),
eligible_members as (
  select distinct on (c.reminder_group_id,c.device_id)
    c.reminder_group_id,
    c.device_id,
    c.job_id,
    c.contractor_id,
    c.reminder_due_date
  from candidate_members c
  join private.sms_reminder_groups g on g.id=c.reminder_group_id
  where c.reminder_due_date between g.anchor_due_date and g.window_end_date
  order by c.reminder_group_id,c.device_id,c.reminder_due_date
)
insert into private.sms_reminder_group_members (
  reminder_group_id,device_id,job_id,contractor_id,reminder_due_date,membership_source
)
select
  reminder_group_id,device_id,job_id,contractor_id,reminder_due_date,'contractor_backfill'
from eligible_members
on conflict do nothing;

create or replace function public.admin_get_device_sms_history(
  p_device_id uuid,
  p_source_job_id uuid default null::uuid
)
returns table(
  id uuid,
  job_id uuid,
  device_id uuid,
  client text,
  phone text,
  status text,
  error_message text,
  created_at timestamptz,
  planned_for timestamptz,
  approved_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  reminder_cycle integer,
  reminder_due_date date
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role'
     and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może odczytywać historię SMS urządzenia.'
      using errcode='42501';
  end if;

  return query
  with device_context as (
    select
      d.id as device_id,
      coalesce(p_source_job_id,private.sms_source_job_uuid(d.source_job_id)) as source_job_id
    from public.devices d
    where d.id=p_device_id
  ),
  matching_groups as (
    select distinct m.reminder_group_id
    from private.sms_reminder_group_members m
    cross join device_context dc
    where m.device_id=p_device_id
       or (dc.source_job_id is not null and m.job_id=dc.source_job_id)
  ),
  effective_job as (
    select source_job_id
    from device_context
    limit 1
  )
  select
    l.id,
    l.job_id,
    l.device_id,
    l.client,
    l.phone,
    l.status,
    l.error_message,
    l.created_at,
    l.planned_for,
    l.approved_at,
    l.sent_at,
    l.delivered_at,
    l.reminder_cycle,
    l.reminder_due_date
  from public.sms_log l
  where l.device_id=p_device_id
     or (
       (select source_job_id from effective_job) is not null
       and l.job_id=(select source_job_id from effective_job)
     )
     or exists (
       select 1
       from matching_groups mg
       where mg.reminder_group_id=l.reminder_group_id
     )
  order by l.created_at desc
  limit 200;
end;
$function$;

revoke all on function public.admin_get_device_sms_history(uuid,uuid)
  from public, anon;
grant execute on function public.admin_get_device_sms_history(uuid,uuid)
  to authenticated, service_role;
