-- WAWIS 12.80: server-owned invoice creation baseline, not exposed to browser/anon.
-- Only the service-role Edge Function may read or write these snapshots.
CREATE TABLE IF NOT EXISTS public.fakturownia_invoice_attempts (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  client_id text NOT NULL CHECK (length(btrim(client_id)) > 0),
  prepared_by uuid NOT NULL REFERENCES auth.users(id),
  buyer_snapshot jsonb NOT NULL,
  baseline_invoice_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > started_at),
  CHECK (expires_at <= started_at + interval '2 hours 5 minutes')
);
ALTER TABLE public.fakturownia_invoice_attempts ENABLE ROW LEVEL SECURITY;
-- Explicitly no authenticated/anon policy: edge function accesses this via service role.
REVOKE ALL ON TABLE public.fakturownia_invoice_attempts FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.fakturownia_invoice_attempts TO service_role;
CREATE INDEX IF NOT EXISTS fakturownia_attempts_client_window_idx
  ON public.fakturownia_invoice_attempts (client_id, expires_at);
COMMENT ON TABLE public.fakturownia_invoice_attempts IS
  'Temporary server-owned baseline for safe zero-click invoice reconciliation (WAWIS 12.80); never a payment record.';
