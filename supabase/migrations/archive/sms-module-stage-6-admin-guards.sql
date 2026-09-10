-- Wersja 6.60
-- Twarde guardy modułu SMS po stronie danych i RPC tylko dla administratora.

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and lower(trim(coalesce(profiles.role, ''))) in ('administrator', 'admin')
  );
$$;

alter table public.sms_settings enable row level security;
alter table public.sms_log enable row level security;

revoke all on public.sms_settings from anon, authenticated;
revoke all on public.sms_log from anon, authenticated;

drop policy if exists "sms_settings_admin_select" on public.sms_settings;
create policy "sms_settings_admin_select"
on public.sms_settings
for select
using (public.current_user_is_admin());

drop policy if exists "sms_settings_admin_insert" on public.sms_settings;
create policy "sms_settings_admin_insert"
on public.sms_settings
for insert
with check (public.current_user_is_admin());

drop policy if exists "sms_settings_admin_update" on public.sms_settings;
create policy "sms_settings_admin_update"
on public.sms_settings
for update
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "sms_settings_admin_delete" on public.sms_settings;
create policy "sms_settings_admin_delete"
on public.sms_settings
for delete
using (public.current_user_is_admin());

drop policy if exists "sms_log_admin_select" on public.sms_log;
create policy "sms_log_admin_select"
on public.sms_log
for select
using (public.current_user_is_admin());

drop policy if exists "sms_log_admin_insert" on public.sms_log;
create policy "sms_log_admin_insert"
on public.sms_log
for insert
with check (public.current_user_is_admin());

drop policy if exists "sms_log_admin_update" on public.sms_log;
create policy "sms_log_admin_update"
on public.sms_log
for update
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "sms_log_admin_delete" on public.sms_log;
create policy "sms_log_admin_delete"
on public.sms_log
for delete
using (public.current_user_is_admin());

create or replace function public.guard_job_sms_runtime_columns()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if (
    new.last_sms_sent_at is distinct from old.last_sms_sent_at
    or new.last_sms_status is distinct from old.last_sms_status
    or new.last_sms_error is distinct from old.last_sms_error
  ) and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może zmieniać techniczne pola statusu SMS.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_job_sms_runtime_columns on public.jobs;
create trigger trg_guard_job_sms_runtime_columns
before update of last_sms_sent_at, last_sms_status, last_sms_error
on public.jobs
for each row
execute function public.guard_job_sms_runtime_columns();

create or replace function public.admin_get_sms_module_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb;
  v_logs jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może odczytywać dane modułu SMS.' using errcode = '42501';
  end if;

  select to_jsonb(s)
    into v_settings
  from (
    select id, is_enabled, sending_mode, sender_name, service_phone, company_name, template_service_reminder, updated_at
    from public.sms_settings
    order by updated_at desc nulls last, created_at desc nulls last
    limit 1
  ) s;

  select coalesce(jsonb_agg(row_to_json(l) order by l.created_at desc), '[]'::jsonb)
    into v_logs
  from (
    select id, job_id, client, phone, sms_type, provider, provider_message_id, status, planned_for, sent_at, delivered_at, error_message, approved_at, created_at
    from public.sms_log
    order by created_at desc
    limit 100
  ) l;

  return jsonb_build_object(
    'settings', coalesce(v_settings, '{}'::jsonb),
    'logs', coalesce(v_logs, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.admin_get_sms_module_snapshot() to authenticated;

create or replace function public.admin_upsert_sms_settings(
  p_is_enabled boolean,
  p_sender_name text,
  p_service_phone text,
  p_company_name text,
  p_template_service_reminder text
)
returns public.sms_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.sms_settings;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.current_user_is_admin() then
    raise exception 'Tylko administrator może zapisywać ustawienia modułu SMS.' using errcode = '42501';
  end if;

  update public.sms_settings
  set
    is_enabled = coalesce(p_is_enabled, true),
    sending_mode = 'approval',
    sender_name = nullif(trim(coalesce(p_sender_name, '')), ''),
    service_phone = nullif(trim(coalesce(p_service_phone, '')), ''),
    company_name = nullif(trim(coalesce(p_company_name, '')), ''),
    template_service_reminder = coalesce(nullif(trim(coalesce(p_template_service_reminder, '')), ''), 'Dzień dobry {client}, przypominamy o obowiązkowym przeglądzie klimatyzacji po 11 miesiącach od montażu. Aby utrzymać gwarancję, prosimy o kontakt: {service_phone}. {company_name}'),
    updated_at = now()
  where id = (
    select id
    from public.sms_settings
    order by updated_at desc nulls last, created_at desc nulls last
    limit 1
  )
  returning * into v_row;

  if v_row.id is null then
    insert into public.sms_settings (
      is_enabled,
      sending_mode,
      sender_name,
      service_phone,
      company_name,
      template_service_reminder,
      updated_at
    ) values (
      coalesce(p_is_enabled, true),
      'approval',
      nullif(trim(coalesce(p_sender_name, '')), ''),
      nullif(trim(coalesce(p_service_phone, '')), ''),
      nullif(trim(coalesce(p_company_name, '')), ''),
      coalesce(nullif(trim(coalesce(p_template_service_reminder, '')), ''), 'Dzień dobry {client}, przypominamy o obowiązkowym przeglądzie klimatyzacji po 11 miesiącach od montażu. Aby utrzymać gwarancję, prosimy o kontakt: {service_phone}. {company_name}'),
      now()
    )
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

grant execute on function public.admin_upsert_sms_settings(boolean, text, text, text, text) to authenticated;
