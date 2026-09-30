-- WAWIS 11.87 — tylko Gotówka/Przelew; przy przelewie kwota może być pominięta.
-- Wartość 0 nie jest przechowywana: aplikacja normalizuje ją do NULL.

begin;

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

alter table public.jobs
  validate constraint jobs_payment_confirmation_consistent;

comment on column public.jobs.payment_amount is
  'Kwota płatności w PLN; przy przelewie może być NULL, gdy kwota nie jest wpisywana.';
comment on column public.jobs.payment_method is
  'Sposób płatności: cash albo transfer.';

commit;
