-- v12.60 P0 — faktury VAT: ochrona pól administracyjnych i jednoznaczne mapowanie Fakturownia -> montaż.

create or replace function private.guard_job_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role()='service_role' or auth.uid() is null or public.current_user_is_admin() then
    return new;
  end if;

  if tg_op='INSERT' then
    new.created_by := auth.uid();

    if new.main_technician_id is not null
       or coalesce(new.admin_note,'')<>''
       or coalesce(new.status,'') not in ('Nowe','W trakcie') then
      raise exception 'Brak uprawnień do przypisania lub statusu.' using errcode='42501';
    end if;

    if coalesce(new.vat_invoice_issued, false)
       or coalesce(new.vat_invoice_fakturownia_confirmed, false)
       or nullif(trim(coalesce(new.vat_invoice_fakturownia_invoice_id, '')), '') is not null
       or nullif(trim(coalesce(new.vat_invoice_fakturownia_invoice_number, '')), '') is not null
       or new.vat_invoice_fakturownia_confirmed_at is not null then
      raise exception 'Tylko administrator może ustawiać pola faktury VAT.' using errcode='42501';
    end if;
  else
    if old.status='Zakończone' then
      if (to_jsonb(new) - array['payment_confirmation_enabled','payment_amount','payment_kind','payment_method','payment_paid_at','payment_recorded_by','payment_updated_at'])
         is distinct from (to_jsonb(old) - array['payment_confirmation_enabled','payment_amount','payment_kind','payment_method','payment_paid_at','payment_recorded_by','payment_updated_at'])
         or (new.payment_recorded_by is not null and new.payment_recorded_by<>auth.uid()) then
        raise exception 'Zakończona karta pozwala tylko zapisać potwierdzenie płatności.' using errcode='42501';
      end if;
      return new;
    end if;

    if new.created_by is distinct from old.created_by
       or new.main_technician_id is distinct from old.main_technician_id
       or coalesce(new.admin_note,'') is distinct from coalesce(old.admin_note,'')
       or new.sms_consent is distinct from old.sms_consent
       or new.sms_reminder_enabled is distinct from old.sms_reminder_enabled
       or new.completed_at is distinct from old.completed_at
       or new.completed_by is distinct from old.completed_by
       or new.vat_invoice_issued is distinct from old.vat_invoice_issued
       or new.vat_invoice_fakturownia_confirmed is distinct from old.vat_invoice_fakturownia_confirmed
       or new.vat_invoice_fakturownia_invoice_id is distinct from old.vat_invoice_fakturownia_invoice_id
       or new.vat_invoice_fakturownia_invoice_number is distinct from old.vat_invoice_fakturownia_invoice_number
       or new.vat_invoice_fakturownia_confirmed_at is distinct from old.vat_invoice_fakturownia_confirmed_at then
      raise exception 'Brak uprawnień do zmiany pól administratora, faktury lub zakończonej karty.' using errcode='42501';
    end if;

    if new.status is distinct from old.status
       and not ((old.status='W trakcie' and new.status='Zakończone')
         or (old.status in ('Nowe','Niezrealizowane','Nowe zlecenie') and new.status='W trakcie')) then
      raise exception 'Niedozwolona zmiana statusu.' using errcode='42501';
    end if;
  end if;

  return new;
end
$$;

create unique index if not exists jobs_vat_invoice_fakturownia_invoice_id_uidx
  on public.jobs ((nullif(trim(vat_invoice_fakturownia_invoice_id), '')))
  where nullif(trim(vat_invoice_fakturownia_invoice_id), '') is not null;

create or replace function public.admin_confirm_job_vat_invoice_fakturownia(
  p_job_id uuid,
  p_invoice_id text,
  p_invoice_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice_id text := nullif(trim(coalesce(p_invoice_id, '')), '');
  v_invoice_number text := nullif(trim(coalesce(p_invoice_number, '')), '');
  v_existing_confirmed boolean;
  v_existing_invoice_id text;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może potwierdzić fakturę VAT.'
      using errcode = '42501';
  end if;

  if v_invoice_id is null then
    raise exception 'Brak identyfikatora faktury z Fakturowni.'
      using errcode = '22023';
  end if;

  select coalesce(vat_invoice_fakturownia_confirmed, false),
         nullif(trim(coalesce(vat_invoice_fakturownia_invoice_id, '')), '')
    into v_existing_confirmed, v_existing_invoice_id
  from public.jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'Nie znaleziono montażu.'
      using errcode = 'P0002';
  end if;

  if v_existing_confirmed and v_existing_invoice_id is distinct from v_invoice_id then
    raise exception 'Montaż ma już potwierdzoną inną fakturę w Fakturowni.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.jobs
    where id <> p_job_id
      and nullif(trim(coalesce(vat_invoice_fakturownia_invoice_id, '')), '') = v_invoice_id
  ) then
    raise exception 'Ta faktura Fakturowni jest już powiązana z innym montażem.'
      using errcode = '23505';
  end if;

  update public.jobs
  set
    vat_invoice_issued = true,
    vat_invoice_fakturownia_confirmed = true,
    vat_invoice_fakturownia_invoice_id = v_invoice_id,
    vat_invoice_fakturownia_invoice_number = coalesce(v_invoice_number, vat_invoice_fakturownia_invoice_number),
    vat_invoice_fakturownia_confirmed_at = coalesce(vat_invoice_fakturownia_confirmed_at, now())
  where id = p_job_id;

  return jsonb_build_object(
    'id', p_job_id,
    'vat_invoice_issued', true,
    'vat_invoice_fakturownia_confirmed', true,
    'vat_invoice_fakturownia_invoice_id', v_invoice_id,
    'vat_invoice_fakturownia_invoice_number', (
      select vat_invoice_fakturownia_invoice_number from public.jobs where id = p_job_id
    ),
    'vat_invoice_fakturownia_confirmed_at', (
      select vat_invoice_fakturownia_confirmed_at from public.jobs where id = p_job_id
    )
  );
end;
$$;

revoke all on function public.admin_confirm_job_vat_invoice_fakturownia(uuid, text, text) from public;
grant execute on function public.admin_confirm_job_vat_invoice_fakturownia(uuid, text, text) to authenticated;
