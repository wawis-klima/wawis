# WAWIS 10.89 — N7 rebuild-only baseline

These files are **rebuild-only**. They must never be applied as normal production migrations.

Canonical order for a fresh isolated Supabase rebuild:

1. `legacy_schema_bootstrap_v1089.sql`
2. `legacy_helpers_bootstrap_v1089.sql`
3. replay the tracked historical `supabase/migrations` through the production baseline (10.88)
4. apply every timestamped `20260917*_n7_v1089_*.sql` file in this directory in ascending filename order
5. deploy tracked Edge Functions from `supabase/functions`
6. run catalog parity, role matrix and real Storage file restore tests

The normal production migration `supabase/migrations/20260917053548_n7_v1089_worker_contractor_read.sql` is intentionally separate: it changes the WAWIS role model so approved employees can read contractor data while contractor writes remain administrator-only.

N7 is CLOSED only when a clean rebuild from these repo files reproduces the required production catalog (plus intentional 10.89 deltas) and all release evidence is green.
