do $guard$
declare
  v_bad integer;
begin
  with identity_map as (
    select
      g.id,g.anchor_due_date,g.window_end_date,
      min(m.contractor_id::text) filter (where m.contractor_id is not null) as contractor_id,
      count(distinct m.contractor_id) filter (where m.contractor_id is not null) as contractor_count,
      min(m.job_id::text) filter (where m.job_id is not null) as job_id,
      count(distinct m.job_id) filter (where m.job_id is not null) as job_count,
      min(m.device_id::text) filter (where m.device_id is not null) as device_id,
      count(distinct m.device_id) filter (where m.device_id is not null) as device_count
    from private.sms_reminder_groups g
    left join private.sms_reminder_group_members m on m.reminder_group_id=g.id
    group by g.id,g.anchor_due_date,g.window_end_date
  ),
  stable as (
    select
      id,anchor_due_date,window_end_date,
      case
        when contractor_count=1 then 'contractor:'||contractor_id
        when contractor_count=0 and job_count=1 then 'job:'||job_id
        when contractor_count=0 and job_count=0 and device_count=1 then 'device:'||device_id
        else null
      end as stable_key
    from identity_map
  ),
  collisions as (
    select stable_key,anchor_due_date
    from stable
    where stable_key is not null
    group by stable_key,anchor_due_date
    having count(*)>1
  ),
  overlap_rows as (
    select 1
    from stable a
    join stable b
      on b.stable_key=a.stable_key
     and b.id>a.id
     and a.stable_key is not null
     and daterange(a.anchor_due_date,a.window_end_date,'[]')
         && daterange(b.anchor_due_date,b.window_end_date,'[]')
    limit 1
  )
  select
    (select count(*) from stable where stable_key is null)
    + (select count(*) from collisions)
    + (select count(*) from overlap_rows)
  into v_bad;

  if v_bad <> 0 then
    raise exception 'N03 stable customer-key migration is ambiguous (% conflicts).',v_bad
      using errcode='23514';
  end if;
end;
$guard$;

with identity_map as (
  select
    g.id,
    min(m.contractor_id::text) filter (where m.contractor_id is not null) as contractor_id,
    count(distinct m.contractor_id) filter (where m.contractor_id is not null) as contractor_count,
    min(m.job_id::text) filter (where m.job_id is not null) as job_id,
    count(distinct m.job_id) filter (where m.job_id is not null) as job_count,
    min(m.device_id::text) filter (where m.device_id is not null) as device_id,
    count(distinct m.device_id) filter (where m.device_id is not null) as device_count
  from private.sms_reminder_groups g
  left join private.sms_reminder_group_members m on m.reminder_group_id=g.id
  group by g.id
),
stable as (
  select
    id,
    case
      when contractor_count=1 then 'contractor:'||contractor_id
      when contractor_count=0 and job_count=1 then 'job:'||job_id
      when contractor_count=0 and job_count=0 and device_count=1 then 'device:'||device_id
      else null
    end as stable_key
  from identity_map
)
update private.sms_reminder_groups g
set customer_key=s.stable_key,
    updated_at=now()
from stable s
where g.id=s.id
  and s.stable_key is not null
  and g.customer_key is distinct from s.stable_key;

create or replace function private.ensure_sms_reminder_group_for_member(
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
  v_phone text;
  v_job_id uuid := p_job_id;
  v_device_job_id uuid;
  v_contractor_id uuid;
  v_job_contractor_id uuid;
  v_customer_key text;
  v_group_id uuid;
  v_future_group_id uuid;
  v_max_due date;
begin
  v_phone := private.normalize_sms_phone(p_phone);
  if v_phone is null then
    raise exception 'Brak numeru telefonu dla grupy SMS.' using errcode='22023';
  end if;
  if p_due_date is null then
    raise exception 'Brak terminu przypomnienia dla grupy SMS.' using errcode='22023';
  end if;
  if p_device_id is null and v_job_id is null then
    raise exception 'Brak urządzenia lub karty do ustalenia tożsamości klienta SMS.'
      using errcode='22023';
  end if;

  if p_device_id is not null then
    select d.contractor_id,private.sms_source_job_uuid(d.source_job_id)
      into v_contractor_id,v_device_job_id
    from public.devices d
    where d.id=p_device_id;

    if not found then
      raise exception 'Urządzenie grupy SMS nie istnieje.' using errcode='23503';
    end if;

    if v_job_id is not null
       and v_device_job_id is not null
       and v_job_id<>v_device_job_id then
      raise exception 'Niezgodne powiązanie urządzenia i karty dla grupy SMS.'
        using errcode='23514';
    end if;

    v_job_id:=coalesce(v_job_id,v_device_job_id);
  end if;

  if v_job_id is not null then
    select j.contractor_id into v_job_contractor_id
    from public.jobs j
    where j.id=v_job_id;

    if not found then
      raise exception 'Karta grupy SMS nie istnieje.' using errcode='23503';
    end if;

    if v_contractor_id is not null
       and v_job_contractor_id is not null
       and v_contractor_id<>v_job_contractor_id then
      raise exception 'Niezgodny kontrahent urządzenia i karty dla grupy SMS.'
        using errcode='23514';
    end if;

    v_contractor_id:=coalesce(v_contractor_id,v_job_contractor_id);
  end if;

  v_customer_key:=case
    when v_contractor_id is not null then 'contractor:'||v_contractor_id::text
    when v_job_id is not null then 'job:'||v_job_id::text
    else 'device:'||p_device_id::text
  end;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_customer_key,0));

  select g.id into v_group_id
  from private.sms_reminder_groups g
  where g.customer_key=v_customer_key
    and p_due_date between g.anchor_due_date and g.window_end_date
  order by g.anchor_due_date
  limit 1;

  if v_group_id is not null then
    update private.sms_reminder_groups
    set normalized_phone=v_phone,
        updated_at=now()
    where id=v_group_id
      and normalized_phone is distinct from v_phone;

    perform private.record_sms_reminder_group_member(
      v_group_id,p_device_id,v_job_id,p_due_date,'runtime'
    );
    return v_group_id;
  end if;

  select g.id into v_future_group_id
  from private.sms_reminder_groups g
  where g.customer_key=v_customer_key
    and g.anchor_due_date>p_due_date
    and g.anchor_due_date<=p_due_date+62
  order by g.anchor_due_date
  limit 1;

  if v_future_group_id is not null then
    select max(l.reminder_due_date) into v_max_due
    from public.sms_log l
    where l.reminder_group_id=v_future_group_id
      and l.reminder_due_date is not null;

    if v_max_due is null or v_max_due<=p_due_date+62 then
      update private.sms_reminder_groups
      set anchor_due_date=p_due_date,
          window_end_date=p_due_date+62,
          normalized_phone=v_phone,
          updated_at=now()
      where id=v_future_group_id;

      perform private.record_sms_reminder_group_member(
        v_future_group_id,p_device_id,v_job_id,p_due_date,'runtime'
      );
      return v_future_group_id;
    end if;
  end if;

  insert into private.sms_reminder_groups(
    customer_key,normalized_phone,anchor_due_date,window_end_date
  )
  values(v_customer_key,v_phone,p_due_date,p_due_date+62)
  returning id into v_group_id;

  perform private.record_sms_reminder_group_member(
    v_group_id,p_device_id,v_job_id,p_due_date,'runtime'
  );

  return v_group_id;
end;
$function$;

revoke all on function private.ensure_sms_reminder_group_for_member(text,date,uuid,uuid)
  from public,anon,authenticated;

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
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji serwerowej SMS.'
      using errcode='42501';
  end if;

  return private.ensure_sms_reminder_group_for_member(
    p_phone,p_due_date,p_device_id,p_job_id
  );
end;
$function$;

revoke all on function public.ensure_service_sms_group_v2(text,date,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.ensure_service_sms_group_v2(text,date,uuid,uuid)
  to service_role;

CREATE OR REPLACE FUNCTION public.claim_service_sms_group_v2(p_log_id uuid, p_job_id uuid, p_device_id uuid, p_cycle integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_log public.sms_log%rowtype;
  v_device public.devices%rowtype;
  v_job public.jobs%rowtype;
  v_contractor public.contractors%rowtype;
  v_source_job uuid;
  v_source_text text;
  v_linked_job uuid;
  v_device_id uuid := p_device_id;
  v_current_phone text;
  v_installation_date date;
  v_due_date date;
  v_today date;
  v_group_id uuid;
  v_existing_primary uuid;
  v_claim_id uuid;
  v_delivery_key text;
  v_client text;
  v_consent_source text := 'job';
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Dostęp wyłącznie dla funkcji wysyłającej.' using errcode = '42501';
  end if;

  if p_cycle is null or p_cycle < 1 or p_cycle > 100 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_cycle');
  end if;

  if p_log_id is not null then
    select * into v_log
    from public.sms_log
    where id = p_log_id
    for update;

    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'log_not_found');
    end if;

    if lower(btrim(coalesce(v_log.status, ''))) <> 'pending_approval'
       or v_log.provider_message_id is not null
       or v_log.sent_at is not null
       or v_log.delivered_at is not null then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'log_not_pending');
    end if;

    if v_device_id is null then v_device_id := v_log.device_id; end if;
    if p_job_id is null then v_linked_job := v_log.job_id; else v_linked_job := p_job_id; end if;
  else
    v_linked_job := p_job_id;
  end if;

  if v_device_id is not null then
    select * into v_device
    from public.devices
    where id = v_device_id;

    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_found');
    end if;

    v_installation_date := v_device.installation_date;
    v_source_text := btrim(coalesce(v_device.source_job_id, ''));

    if v_source_text <> '' then
      v_source_job := private.sms_source_job_uuid(v_source_text);

      if v_source_job is null then
        return pg_catalog.jsonb_build_object(
          'ok', false,
          'reason', 'missing_linked_job_consent',
          'message', 'Urządzenie ma nieprawidłowe powiązanie z kartą klienta.'
        );
      end if;

      if v_linked_job is not null and v_linked_job <> v_source_job then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'job_device_mismatch');
      end if;

      v_linked_job := v_source_job;
    else
      if v_linked_job is not null then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'job_device_mismatch');
      end if;

      if v_device.sms_consent is not true or v_device.sms_reminder_enabled is not true then
        return pg_catalog.jsonb_build_object(
          'ok', false,
          'reason', 'sms_disabled',
          'message', 'Zgoda SMS lub przypomnienia dla tego starszego urządzenia są wyłączone.'
        );
      end if;

      if v_device.contractor_id is null then
        return pg_catalog.jsonb_build_object(
          'ok', false,
          'reason', 'missing_legacy_contractor',
          'message', 'Starsze urządzenie nie ma przypisanego kontrahenta.'
        );
      end if;

      select * into v_contractor
      from public.contractors
      where id = v_device.contractor_id;

      if not found then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'contractor_not_found');
      end if;

      v_current_phone := private.normalize_sms_phone(v_contractor.phone);
      if v_current_phone is null then
        return pg_catalog.jsonb_build_object(
          'ok', false,
          'reason', 'invalid_current_phone',
          'message', 'Aktualny numer telefonu klienta nie jest prawidłowym polskim numerem.'
        );
      end if;

      v_client := coalesce(
        nullif(btrim(v_contractor.company_name), ''),
        nullif(btrim(v_contractor.contact_person), ''),
        'Kliencie'
      );
      v_consent_source := 'legacy_device';
    end if;
  end if;

  if v_consent_source = 'job' then
    if v_linked_job is null then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'reason', 'missing_linked_job_consent',
        'message', 'Brak karty klienta z jednoznaczną zgodą SMS.'
      );
    end if;

    select * into v_job
    from public.jobs
    where id = v_linked_job;

    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'job_not_found');
    end if;

    if v_job.sms_consent is not true or v_job.sms_reminder_enabled is not true then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'reason', 'sms_disabled',
        'message', 'Zgoda SMS lub przypomnienia są obecnie wyłączone.'
      );
    end if;

    v_current_phone := private.normalize_sms_phone(
      coalesce(nullif(btrim(v_job.sms_recipient_phone), ''), v_job.phone)
    );
    if v_current_phone is null then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'reason', 'invalid_current_phone',
        'message', 'Aktualny numer telefonu klienta nie jest prawidłowym polskim numerem.'
      );
    end if;

    if v_installation_date is null then
      v_installation_date := v_job.installation_date;
    end if;

    v_client := coalesce(
      nullif(btrim(v_job.client), ''),
      nullif(btrim(v_job.title), ''),
      'Kliencie'
    );
  end if;

  v_due_date := private.service_sms_due_date(v_installation_date, p_cycle);
  if v_due_date is null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'missing_installation_date');
  end if;

  v_today := (current_timestamp at time zone 'Europe/Warsaw')::date;

  if v_today < v_due_date or v_today > v_due_date + 62 then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'outside_active_window',
      'current_due_date', v_due_date,
      'window_end_date', v_due_date + 62,
      'today_warsaw', v_today
    );
  end if;

  v_group_id := private.ensure_sms_reminder_group_for_member(v_current_phone, v_due_date, v_device_id, v_linked_job);

  if exists (
    select 1
    from public.sms_log l
    where l.reminder_group_id = v_group_id
      and (
        lower(btrim(coalesce(l.status, ''))) in ('sent', 'provider_sent', 'delivered')
        or l.provider_message_id is not null
      )
      and (p_log_id is null or l.id <> p_log_id)
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'group_already_sent',
      'reminder_group_id', v_group_id
    );
  end if;

  if p_log_id is not null then
    select l.id into v_existing_primary
    from public.sms_log l
    where l.reminder_group_id = v_group_id
      and l.reminder_group_primary
      and l.id <> p_log_id
    order by l.created_at desc
    limit 1;

    if v_existing_primary is not null then
      if v_log.reminder_group_id is distinct from v_group_id then
        update public.sms_log
        set
          status = 'deleted',
          reminder_group_primary = false,
          error_message = 'Pozycja zastąpiona aktualną grupą klienta po zmianie danych.'
        where id = p_log_id;
      end if;

      return pg_catalog.jsonb_build_object(
        'ok', false,
        'reason', 'group_already_has_primary',
        'reminder_group_id', v_group_id,
        'primary_log_id', v_existing_primary
      );
    end if;

    update public.sms_log
    set
      job_id = v_linked_job,
      device_id = v_device_id,
      phone = v_current_phone,
      client = v_client,
      reminder_cycle = p_cycle,
      reminder_due_date = v_due_date,
      reminder_group_id = v_group_id,
      reminder_group_primary = true
    where id = p_log_id;
  end if;

  v_delivery_key := 'group:' || v_group_id::text;

  insert into private.sms_delivery_claims(
    delivery_key,
    reminder_group_id,
    source_log_id,
    job_id,
    device_id,
    recipient_phone,
    reminder_cycle,
    reminder_due_date,
    client
  )
  values (
    v_delivery_key,
    v_group_id,
    p_log_id,
    v_linked_job,
    v_device_id,
    v_current_phone,
    p_cycle,
    v_due_date,
    v_client
  )
  on conflict do nothing
  returning claim_id into v_claim_id;

  if v_claim_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'group_claim_exists',
      'reminder_group_id', v_group_id
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'claim_id', v_claim_id,
    'reminder_group_id', v_group_id,
    'recipient_phone', v_current_phone,
    'current_due_date', v_due_date,
    'window_end_date', v_due_date + 62,
    'linked_job_id', v_linked_job,
    'device_id', v_device_id,
    'installation_date', v_installation_date,
    'client', v_client,
    'cycle', p_cycle,
    'consent_source', v_consent_source
  );
end;
$function$;

revoke all on function public.claim_service_sms_group_v2(uuid,uuid,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.claim_service_sms_group_v2(uuid,uuid,uuid,integer)
  to service_role;
