# WAWIS 10.90 — post-deploy closeout

## Release

- Release head: `5be32518c9a923eabf06c77999fe25361441a40d`.
- Final WAWIS PR checks run #200: PASS, including release policy, fail-closed checks, grouped regressions, required Playwright E2E and production build.
- PR #52 merged to `main` as `91124943faded193c16ec532500a2b4afcc93b7c` at `2026-09-17T19:33:25Z`.
- Vercel status for the exact production merge SHA: SUCCESS.
- The exact deployed tree contains `app-version.json = 10.90` and Service Worker cache `wawis-app-shell-v10.90`.

## Production Supabase

Project: `uohziyaudbpwmupvljyd`.

Applied 10.90 migrations:

- `admin_manual_nameplate_completion_v1090`;
- `security_hardening_v1090`.

Production read-back after migration:

- `admin_list_deleted_jobs()` — `SECURITY DEFINER`, `search_path=''`, `anon EXECUTE=false`, `authenticated EXECUTE=true`;
- `job_file_can_be_deleted(text,text)` — `SECURITY DEFINER`, `search_path=''`, `anon EXECUTE=false`, `authenticated EXECUTE=true`;
- `storage_object_job_id(text)` — `SECURITY INVOKER`, `search_path=''`;
- 15/15 functions previously reported with mutable search path now have `search_path=''`.

Security Advisor after production deployment:

- no `anon_security_definer_function_executable` finding for the 10.90 target RPCs;
- no `function_search_path_mutable` finding for the 10.90 target set;
- remaining `authenticated_security_definer_function_executable` warnings are intentionally not mass-revoked and remain a function-by-function hardening backlog;
- `private.push_subscription_lifecycle_tombstones` remains an accepted INFO finding because `anon` and `authenticated` have no schema usage or direct DML access.

## Diagnostics

From the production merge time `2026-09-17T19:33:25Z` to the closeout check:

- `app_diagnostic_events`: 0 new events;
- error/fatal events: 0.

## Staging cleanup

Temporary Supabase branch:

- name: `wawis-10-90-security-staging`;
- branch id: `fe7e0006-6e8e-42e3-a3c2-7d12708704cf`;
- project ref: `sailtkxxyvcalcndrpyh`;
- cost while active: `0.01344 USD/h`.

The branch was deleted after production verification. Final branch listing contains only production `main`, so the temporary hourly staging cost is no longer continuing.

## Live verification limitation

The connected Vercel API returned 403 for direct URL fetching. Live identity is therefore established by the Vercel SUCCESS status attached to the exact production merge SHA plus the contents of that exact SHA (`app-version.json=10.90`, Service Worker cache `wawis-app-shell-v10.90`).

## Status

**WAWIS 10.90 CLOSED / PRODUCTION VERIFIED.**
