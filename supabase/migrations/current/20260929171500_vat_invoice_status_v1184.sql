-- v11.84 — status wystawienia faktury VAT dla montaży (desktop administratora).
-- Nowe i bieżące montaże startują jako niewystawione.
-- Przy pierwszym wdrożeniu starsze zakończone montaże poza 10 najnowszymi
-- (kolejność taka jak domyślna lista desktop: data montażu malejąco,
-- następnie data utworzenia malejąco) oznaczamy jako już wystawione.

alter table public.jobs
  add column if not exists vat_invoice_issued boolean not null default false;

comment on column public.jobs.vat_invoice_issued is
  'Administrator desktop: czy faktura VAT dla montażu została wystawiona.';

with ranked_completed as (
  select
    id,
    row_number() over (
      order by installation_date desc nulls last, created_at desc nulls last, id desc
    ) as row_no
  from public.jobs
  where status = 'Zakończone'
)
update public.jobs j
set vat_invoice_issued = true
from ranked_completed r
where j.id = r.id
  and r.row_no > 10;

create or replace function public.admin_set_job_vat_invoice_issued(
  p_job_id uuid,
  p_issued boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może zmienić status faktury VAT.'
      using errcode = '42501';
  end if;

  update public.jobs
  set vat_invoice_issued = coalesce(p_issued, false)
  where id = p_job_id;

  if not found then
    raise exception 'Nie znaleziono montażu.'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', p_job_id,
    'vat_invoice_issued', coalesce(p_issued, false)
  );
end;
$$;

revoke all on function public.admin_set_job_vat_invoice_issued(uuid, boolean) from public;
grant execute on function public.admin_set_job_vat_invoice_issued(uuid, boolean) to authenticated;
