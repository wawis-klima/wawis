-- SMS audit closure: stable callback authentication independent from SMSAPI access token.
-- The current callback token lives only in private schema. Rotation keeps the previous
-- callback token valid for a bounded grace period, so delayed callbacks are not lost.

create table if not exists private.sms_callback_auth_config (
  singleton boolean primary key default true check (singleton),
  current_token text not null,
  previous_token text,
  previous_valid_until timestamptz,
  updated_at timestamptz not null default now()
);

revoke all on table private.sms_callback_auth_config from public, anon, authenticated;

insert into private.sms_callback_auth_config(singleton,current_token)
values (
  true,
  pg_catalog.encode(extensions.gen_random_bytes(32), 'hex')
)
on conflict (singleton) do nothing;

create or replace function public.get_smsapi_callback_auth_tokens()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_current text;
  v_previous text;
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji serwerowych SMS.' using errcode='42501';
  end if;

  select
    current_token,
    case
      when previous_token is not null
       and previous_valid_until is not null
       and previous_valid_until > now()
      then previous_token
      else null
    end
  into v_current, v_previous
  from private.sms_callback_auth_config
  where singleton is true;

  if nullif(btrim(coalesce(v_current,'')),'') is null then
    raise exception 'Brak aktywnego tokenu callbacku SMS.' using errcode='55000';
  end if;

  return pg_catalog.jsonb_build_object(
    'current', v_current,
    'previous', v_previous
  );
end;
$function$;

create or replace function public.rotate_smsapi_callback_auth_token(
  p_grace_minutes integer default 10080
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_current text;
  v_previous_valid_until timestamptz;
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji serwerowych SMS.' using errcode='42501';
  end if;

  if p_grace_minutes is null or p_grace_minutes < 60 or p_grace_minutes > 43200 then
    raise exception 'Okres przejściowy callbacku musi wynosić od 60 do 43200 minut.'
      using errcode='22023';
  end if;

  update private.sms_callback_auth_config
  set previous_token=current_token,
      previous_valid_until=now() + pg_catalog.make_interval(mins => p_grace_minutes),
      current_token=pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'),
      updated_at=now()
  where singleton is true
  returning current_token, previous_valid_until
  into v_current, v_previous_valid_until;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'current', v_current,
    'previous_valid_until', v_previous_valid_until
  );
end;
$function$;

revoke all on function public.get_smsapi_callback_auth_tokens() from public, anon, authenticated;
grant execute on function public.get_smsapi_callback_auth_tokens() to service_role;

revoke all on function public.rotate_smsapi_callback_auth_token(integer) from public, anon, authenticated;
grant execute on function public.rotate_smsapi_callback_auth_token(integer) to service_role;
