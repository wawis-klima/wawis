create schema if not exists private;

create table if not exists private.job_delete_operations (
  operation_id uuid primary key,
  job_id uuid not null,
  requested_by uuid not null,
  outcome text not null default 'pending',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint job_delete_operations_outcome_chk
    check (outcome in ('pending','deleted'))
);

alter table private.job_delete_operations enable row level security;
revoke all on private.job_delete_operations from public, anon, authenticated;

create index if not exists job_delete_operations_created_at_idx
  on private.job_delete_operations(created_at);

create or replace function public.change_job_status_guarded(
  p_job_id uuid,
  p_expected_status text,
  p_new_status text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_changed public.jobs%rowtype;
  v_current public.jobs%rowtype;
begin
  if auth.uid() is null or not public.current_user_is_staff() then
    raise exception 'Brak uprawnień do zmiany statusu.' using errcode='42501';
  end if;
  if p_job_id is null or nullif(trim(coalesce(p_new_status, '')), '') is null then
    raise exception 'Brak identyfikatora karty lub docelowego statusu.' using errcode='22023';
  end if;

  update public.jobs j
     set status = p_new_status
   where j.id = p_job_id
     and j.status is not distinct from p_expected_status
  returning j.* into v_changed;

  if found then
    return jsonb_build_object('outcome','changed','id',v_changed.id,'status',v_changed.status);
  end if;

  select * into v_current from public.jobs j where j.id = p_job_id;
  if not found then
    return jsonb_build_object('outcome','not_found','id',p_job_id);
  end if;

  if v_current.status is not distinct from p_new_status then
    return jsonb_build_object('outcome','already_applied','id',v_current.id,'status',v_current.status);
  end if;

  return jsonb_build_object(
    'outcome','conflict',
    'id',v_current.id,
    'current_status',v_current.status,
    'expected_status',p_expected_status,
    'requested_status',p_new_status
  );
end
$function$;

alter function public.change_job_status_guarded(uuid,text,text) owner to postgres;
revoke all on function public.change_job_status_guarded(uuid,text,text) from public, anon;
grant execute on function public.change_job_status_guarded(uuid,text,text) to authenticated, service_role;

create or replace function public.admin_delete_job_idempotent(
  p_job_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_op private.job_delete_operations%rowtype;
  v_deleted_id uuid;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może usuwać karty.' using errcode='42501';
  end if;
  if p_job_id is null or p_operation_id is null then
    raise exception 'Brak identyfikatora karty lub operacji usuwania.' using errcode='22023';
  end if;

  insert into private.job_delete_operations(operation_id, job_id, requested_by, outcome)
  values (p_operation_id, p_job_id, auth.uid(), 'pending')
  on conflict (operation_id) do nothing;

  select * into v_op
    from private.job_delete_operations
   where operation_id = p_operation_id
   for update;

  if not found then
    raise exception 'Nie udało się zarezerwować operacji usuwania.';
  end if;

  if v_op.job_id is distinct from p_job_id or v_op.requested_by is distinct from auth.uid() then
    raise exception 'Identyfikator operacji usuwania jest już używany dla innego żądania.' using errcode='23505';
  end if;

  if v_op.outcome = 'deleted' then
    return jsonb_build_object('outcome','already_applied','id',p_job_id,'operation_id',p_operation_id);
  end if;

  delete from public.jobs j where j.id = p_job_id returning j.id into v_deleted_id;

  if v_deleted_id is null then
    delete from private.job_delete_operations
     where operation_id = p_operation_id and outcome = 'pending';
    return jsonb_build_object('outcome','not_found','id',p_job_id,'operation_id',p_operation_id);
  end if;

  update private.job_delete_operations
     set outcome = 'deleted', deleted_at = now()
   where operation_id = p_operation_id;

  return jsonb_build_object('outcome','deleted','id',v_deleted_id,'operation_id',p_operation_id);
end
$function$;

alter function public.admin_delete_job_idempotent(uuid,uuid) owner to postgres;
revoke all on function public.admin_delete_job_idempotent(uuid,uuid) from public, anon;
grant execute on function public.admin_delete_job_idempotent(uuid,uuid) to authenticated, service_role;
