-- WAWIS Klimatyzacja v9.86
-- Opcjonalne potwierdzenie zapłaty zapisywane przy zakończonym zleceniu.
-- Skrypt jest idempotentny i może zostać bezpiecznie uruchomiony ponownie.

begin;

alter table public.jobs
  add column if not exists payment_confirmation_enabled boolean not null default false,
  add column if not exists payment_amount numeric(12,2),
  add column if not exists payment_kind text,
  add column if not exists payment_method text,
  add column if not exists payment_paid_at timestamptz,
  add column if not exists payment_recorded_by uuid references public.profiles(id) on delete set null,
  add column if not exists payment_updated_at timestamptz;

comment on column public.jobs.payment_confirmation_enabled is
  'Czy podpisany protokół zawiera opcjonalne potwierdzenie zapłaty klienta.';
comment on column public.jobs.payment_amount is
  'Kwota płatności w PLN; przy przelewie może być NULL, gdy kwota nie jest wpisywana.';
comment on column public.jobs.payment_kind is
  'Rodzaj płatności: full (całość) albo deposit (zaliczka).';
comment on column public.jobs.payment_method is
  'Sposób płatności: cash albo transfer.';

alter table public.jobs
  drop constraint if exists jobs_payment_confirmation_consistent;

alter table public.jobs
  add constraint jobs_payment_confirmation_consistent check (
    (
      payment_confirmation_enabled = false
      and payment_amount is null
      and payment_kind is null
      and payment_method is null
      and payment_paid_at is null
    )
    or
    (
      payment_confirmation_enabled = true
      and payment_kind in ('full', 'deposit')
      and payment_paid_at is not null
      and (
        (payment_method = 'cash' and payment_amount > 0)
        or
        (payment_method = 'transfer' and (payment_amount is null or payment_amount > 0))
      )
    )
  ) not valid;

alter table public.jobs validate constraint jobs_payment_confirmation_consistent;

grant select on table public.jobs to authenticated, service_role;
grant update (
  payment_confirmation_enabled,
  payment_amount,
  payment_kind,
  payment_method,
  payment_paid_at,
  payment_recorded_by,
  payment_updated_at
) on table public.jobs to authenticated, service_role;

grant update on table public.job_protocols to authenticated;

drop policy if exists "job_protocols_update_owner_or_admin" on public.job_protocols;
create policy "job_protocols_update_owner_or_admin"
on public.job_protocols
for update
to authenticated
using (
  public.current_user_can_access_job(job_id)
  and (
    public.current_user_is_admin()
    or created_by = (select auth.uid())
  )
)
with check (
  created_by = (select auth.uid())
  and public.current_user_can_access_job(job_id)
  and exists (
    select 1 from public.jobs j
    where j.id = job_id and j.status = 'Zakończone'
  )
);

commit;
