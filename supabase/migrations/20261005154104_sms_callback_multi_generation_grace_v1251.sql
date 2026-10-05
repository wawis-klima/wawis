create table if not exists private.sms_callback_auth_token_history (
  token text primary key,
  valid_until timestamptz not null,
  created_at timestamptz not null default now()
);

revoke all on table private.sms_callback_auth_token_history from public, anon, authenticated;

insert into private.sms_callback_auth_token_history(token, valid_until, created_at)
select previous_token, previous_valid_until, updated_at
from private.sms_callback_auth_config
where singleton is true
  and previous_token is not null
  and previous_valid_until is not null
  and previous_valid_until > now()
on conflict (token) do update
set valid_until = greatest(
      private.sms_callback_auth_token_history.valid_until,
      excluded.valid_until
    );

create or replace function public.get_smsapi_callback_auth_tokens()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_now timestamptz:=now();
  v_current text;
  v_previous text;
  v_history jsonb;
  v_valid_tokens jsonb;
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji serwerowych SMS.' using errcode='42501';
  end if;

  select
    current_token,
    case
      when previous_token is not null
       and previous_valid_until is not null
       and previous_valid_until > v_now
      then previous_token
      else null
    end
  into v_current, v_previous
  from private.sms_callback_auth_config
  where singleton is true;

  if nullif(btrim(coalesce(v_current,'')),'') is null then
    raise exception 'Brak aktywnego tokenu callbacku SMS.' using errcode='55000';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(h.token order by h.valid_until desc, h.created_at desc),
    '[]'::jsonb
  )
  into v_history
  from private.sms_callback_auth_token_history h
  where h.valid_until > v_now
    and h.token <> v_current;

  v_valid_tokens := pg_catalog.jsonb_build_array(v_current) || v_history;

  return pg_catalog.jsonb_build_object(
    'current', v_current,
    'previous', v_previous,
    'valid_tokens', v_valid_tokens
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
  v_now timestamptz:=now();
  v_old_current text;
  v_current text;
  v_previous_valid_until timestamptz;
  v_valid_generation_count integer;
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji serwerowych SMS.' using errcode='42501';
  end if;

  if p_grace_minutes is null or p_grace_minutes < 60 or p_grace_minutes > 43200 then
    raise exception 'Okres przejściowy callbacku musi wynosić od 60 do 43200 minut.'
      using errcode='22023';
  end if;

  select current_token
  into v_old_current
  from private.sms_callback_auth_config
  where singleton is true
  for update;

  if nullif(btrim(coalesce(v_old_current,'')),'') is null then
    raise exception 'Brak aktywnego tokenu callbacku SMS.' using errcode='55000';
  end if;

  insert into private.sms_callback_auth_token_history(token, valid_until, created_at)
  select previous_token, previous_valid_until, updated_at
  from private.sms_callback_auth_config
  where singleton is true
    and previous_token is not null
    and previous_valid_until is not null
    and previous_valid_until > v_now
    and previous_token <> v_old_current
  on conflict (token) do update
  set valid_until = greatest(
        private.sms_callback_auth_token_history.valid_until,
        excluded.valid_until
      );

  delete from private.sms_callback_auth_token_history
  where valid_until <= v_now;

  v_previous_valid_until := v_now + pg_catalog.make_interval(mins => p_grace_minutes);

  insert into private.sms_callback_auth_token_history(token, valid_until, created_at)
  values(v_old_current, v_previous_valid_until, v_now)
  on conflict (token) do update
  set valid_until = greatest(
        private.sms_callback_auth_token_history.valid_until,
        excluded.valid_until
      );

  v_current := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');

  update private.sms_callback_auth_config
  set previous_token=v_old_current,
      previous_valid_until=v_previous_valid_until,
      current_token=v_current,
      updated_at=v_now
  where singleton is true;

  select count(*)::integer
  into v_valid_generation_count
  from private.sms_callback_auth_token_history
  where valid_until > v_now;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'current', v_current,
    'previous_valid_until', v_previous_valid_until,
    'valid_previous_generations', v_valid_generation_count
  );
end;
$function$;

revoke all on function public.get_smsapi_callback_auth_tokens() from public, anon, authenticated;
grant execute on function public.get_smsapi_callback_auth_tokens() to service_role;

revoke all on function public.rotate_smsapi_callback_auth_token(integer) from public, anon, authenticated;
grant execute on function public.rotate_smsapi_callback_auth_token(integer) to service_role;
