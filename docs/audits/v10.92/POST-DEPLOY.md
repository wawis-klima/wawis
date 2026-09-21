# WAWIS 10.92 — POST-DEPLOY

## Release identity
- release source head: `5a902538c21b9f2dc622812f3d5a7bab320fadc4`
- PR: #60
- production merge SHA: `35ec4e038c5ce59fdd34c3a5edee4608e4d15912`
- production Supabase: `uohziyaudbpwmupvljyd`

## Final CI
`WAWIS PR checks` run `35295224318` completed **SUCCESS**.

Passed:
- release policy validation,
- fail-closed release-gate reproduction,
- targeted regression groups,
- required Playwright E2E,
- production build.

The first PR run failed only because the new full-layout regression was intentionally WebKit-specific but was also picked up by the generic Chromium runner. The test was scoped to WebKit; runtime code was unchanged. The final PR run then passed completely.

## Supabase production
Applied migration:
- `20260918012815 admin_finish_without_nameplates_v1092`

Post-migration read-back confirmed `private.assert_job_nameplates_complete` contains the administrator bypass before physical-photo validation.

Live role verification on the deployed function:
- administrator without nameplates: **PASS**,
- worker without nameplates: **BLOCKED**,
- worker SQLSTATE: `23514`,
- error prefix: `job_nameplates_incomplete`.

Security Advisor after the migration reported only previously known warnings around existing SECURITY DEFINER functions and the private push tombstone table. No new 10.92-specific issue was introduced.

## Vercel / app shell
GitHub deployment status for the exact production merge SHA reports **Vercel SUCCESS**.

Repository read-back on `main`:
- `app-version.json = 10.92`,
- Service Worker cache: `wawis-app-shell-v10.92`.

## Diagnostics
Merge time: `2026-09-18T01:27:55Z`.

At post-deploy check `2026-09-18T01:29:22.868368Z`:
- diagnostic events after merge: **0**,
- error/fatal after merge: **0**.

## Staging cleanup
The attempted Supabase preview branch hit the already known historical Branching migration-pipeline failure before the application schema was available. It was not used as release evidence and was deleted. Production verification used the safe pre-deploy `pg_temp` shadow test and the real post-migration role test.

Current Supabase branches: production main only.

## Final
**PASS — WAWIS 10.92 is released and closed.**
