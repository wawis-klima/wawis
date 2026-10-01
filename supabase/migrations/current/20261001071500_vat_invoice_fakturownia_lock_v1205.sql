-- v12.05 — potwierdzenie faktury VAT w Fakturowni blokuje cofnięcie statusu.
-- Manualny status nadal działa, dopóki faktura nie została potwierdzona przez integrację.

alter table public.jobs
  add column if not exists vat_invoice_fakturownia_confirmed boolean not null default false,
  add column if not exists vat_invoice_fakturownia_invoice_id text null,
  add column if not exists vat_invoice_fakturownia_invoice_number text null,
  add column if not exists vat_invoice_fakturownia_confirmed_at timestamptz null;

comment on column public.jobs.vat_invoice_fakturownia_confirmed is
  'Czy wystawienie faktury VAT zostało potwierdzone przez API Fakturowni. Gdy true, statusu nie wolno cofnąć ręcznie.';
comment on column public.jobs.vat_invoice_fakturownia_invoice_id is
  'Identyfikator faktury zwrócony przez Fakturownię przy automatycznym potwierdzeniu.';
comment on column public.jobs.vat_invoice_fakturownia_invoice_number is
  'Numer faktury zwrócony przez Fakturownię przy automatycznym potwierdzeniu.';
comment on column public.jobs.vat_invoice_fakturownia_confirmed_at is
  'Czas automatycznego potwierdzenia faktury VAT przez Fakturownię.';

create or replace function public.admin_set_job_vat_invoice_issued(
  p_job_id uuid,
  p_issued boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_confirmed boolean;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może zmienić status faktury VAT.'
      using errcode = '42501';
  end if;

  select coalesce(vat_invoice_fakturownia_confirmed, false)
    into v_confirmed
  from public.jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'Nie znaleziono montażu.'
      using errcode = 'P0002';
  end if;

  if v_confirmed and not coalesce(p_issued, false) then
    raise exception 'Faktura VAT została potwierdzona w Fakturowni i nie można oznaczyć jej jako niewystawionej.'
      using errcode = 'P0001';
  end if;

  update public.jobs
  set vat_invoice_issued = coalesce(p_issued, false)
  where id = p_job_id;

  return jsonb_build_object(
    'id', p_job_id,
    'vat_invoice_issued', coalesce(p_issued, false),
    'vat_invoice_fakturownia_confirmed', v_confirmed
  );
end;
$$;

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
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może potwierdzić fakturę VAT.'
      using errcode = '42501';
  end if;

  if v_invoice_id is null then
    raise exception 'Brak identyfikatora faktury z Fakturowni.'
      using errcode = '22023';
  end if;

  update public.jobs
  set
    vat_invoice_issued = true,
    vat_invoice_fakturownia_confirmed = true,
    vat_invoice_fakturownia_invoice_id = v_invoice_id,
    vat_invoice_fakturownia_invoice_number = v_invoice_number,
    vat_invoice_fakturownia_confirmed_at = coalesce(vat_invoice_fakturownia_confirmed_at, now())
  where id = p_job_id;

  if not found then
    raise exception 'Nie znaleziono montażu.'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', p_job_id,
    'vat_invoice_issued', true,
    'vat_invoice_fakturownia_confirmed', true,
    'vat_invoice_fakturownia_invoice_id', v_invoice_id,
    'vat_invoice_fakturownia_invoice_number', v_invoice_number,
    'vat_invoice_fakturownia_confirmed_at', (
      select vat_invoice_fakturownia_confirmed_at
      from public.jobs
      where id = p_job_id
    )
  );
end;
$$;

revoke all on function public.admin_set_job_vat_invoice_issued(uuid, boolean) from public;
grant execute on function public.admin_set_job_vat_invoice_issued(uuid, boolean) to authenticated;

revoke all on function public.admin_confirm_job_vat_invoice_fakturownia(uuid, text, text) from public;
grant execute on function public.admin_confirm_job_vat_invoice_fakturownia(uuid, text, text) to authenticated;
