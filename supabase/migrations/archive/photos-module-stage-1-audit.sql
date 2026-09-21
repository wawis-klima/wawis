begin;

create extension if not exists pgcrypto;

create table if not exists public.photo_audit_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid null references public.jobs(id) on delete set null,
  photo_id uuid null,
  actor_user_id uuid null,
  actor_role text null,
  action text not null,
  source text not null default 'app',
  storage_path text null,
  image_url text null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists photo_audit_log_job_created_idx
  on public.photo_audit_log (job_id, created_at desc);

create index if not exists photo_audit_log_photo_created_idx
  on public.photo_audit_log (photo_id, created_at desc);

grant select, insert
  on table public.photo_audit_log
  to authenticated;

grant select, insert, update, delete
  on table public.photo_audit_log
  to service_role;

grant usage, select
  on all sequences in schema public
  to authenticated, service_role;

alter table public.photo_audit_log enable row level security;

drop policy if exists photo_audit_log_admin_read on public.photo_audit_log;
create policy photo_audit_log_admin_read
  on public.photo_audit_log
  for select
  to authenticated
  using (public.current_user_is_admin());

drop policy if exists photo_audit_log_service_insert on public.photo_audit_log;
create policy photo_audit_log_service_insert
  on public.photo_audit_log
  for insert
  to authenticated
  with check (auth.uid() is not null);

create or replace function public.photo_audit_log_event(
  p_action text,
  p_job_id uuid default null,
  p_photo_id uuid default null,
  p_storage_path text default null,
  p_image_url text default null,
  p_source text default 'app',
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_actor_id uuid := auth.uid();
  v_actor_role text := case when public.current_user_is_admin() then 'admin' else 'user' end;
begin
  insert into public.photo_audit_log (
    job_id,
    photo_id,
    actor_user_id,
    actor_role,
    action,
    source,
    storage_path,
    image_url,
    details
  )
  values (
    p_job_id,
    p_photo_id,
    v_actor_id,
    v_actor_role,
    trim(coalesce(p_action, '')),
    coalesce(nullif(trim(coalesce(p_source, '')), ''), 'app'),
    nullif(trim(coalesce(p_storage_path, '')), ''),
    nullif(trim(coalesce(p_image_url, '')), ''),
    coalesce(p_details, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.photo_audit_log_event(text, uuid, uuid, text, text, text, jsonb) to authenticated;

create or replace function public.photo_audit_photos_change_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text := case when public.current_user_is_admin() then 'admin' else 'user' end;
begin
  if tg_op = 'INSERT' then
    insert into public.photo_audit_log (
      job_id, photo_id, actor_user_id, actor_role, action, source, storage_path, image_url, details
    )
    values (
      new.job_id,
      new.id,
      v_actor_id,
      v_actor_role,
      'photo_inserted',
      'trigger.photos',
      new.storage_path,
      new.image_url,
      jsonb_build_object('uploaded_by', new.uploaded_by, 'created_at', new.created_at)
    );
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.photo_audit_log (
      job_id, photo_id, actor_user_id, actor_role, action, source, storage_path, image_url, details
    )
    values (
      new.job_id,
      new.id,
      v_actor_id,
      v_actor_role,
      'photo_updated',
      'trigger.photos',
      new.storage_path,
      new.image_url,
      jsonb_build_object(
        'old_job_id', old.job_id,
        'old_storage_path', old.storage_path,
        'old_image_url', old.image_url,
        'new_job_id', new.job_id,
        'new_storage_path', new.storage_path,
        'new_image_url', new.image_url
      )
    );
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.photo_audit_log (
      job_id, photo_id, actor_user_id, actor_role, action, source, storage_path, image_url, details
    )
    values (
      old.job_id,
      old.id,
      v_actor_id,
      v_actor_role,
      'photo_deleted',
      'trigger.photos',
      old.storage_path,
      old.image_url,
      jsonb_build_object('uploaded_by', old.uploaded_by, 'created_at', old.created_at)
    );
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists photo_audit_photos_change on public.photos;
create trigger photo_audit_photos_change
after insert or update or delete on public.photos
for each row
execute function public.photo_audit_photos_change_trigger();

create or replace function public.admin_get_job_photo_audit(p_job_id uuid)
returns table (
  id uuid,
  job_id uuid,
  photo_id uuid,
  actor_user_id uuid,
  actor_role text,
  action text,
  source text,
  storage_path text,
  image_url text,
  details jsonb,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    l.id,
    l.job_id,
    l.photo_id,
    l.actor_user_id,
    l.actor_role,
    l.action,
    l.source,
    l.storage_path,
    l.image_url,
    l.details,
    l.created_at
  from public.photo_audit_log l
  where public.current_user_is_admin()
    and l.job_id = p_job_id
  order by l.created_at desc, l.id desc;
$$;

grant execute on function public.admin_get_job_photo_audit(uuid) to authenticated;

commit;
