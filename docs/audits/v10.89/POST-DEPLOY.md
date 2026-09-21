# WAWIS 10.89 — post-deploy closeout

Checked at: `2026-09-17T18:48:50.850Z`

## Production identity

- Release branch: `release/v10.89`
- Verified release HEAD before merge: `a348f8b2cdb9b7be2ce3d346270481adaa12a2a4`
- Production `main` merge SHA: `ee7aed94c37ea2ae37497787c70ea92d3a5d386e`
- Production Supabase ref: `uohziyaudbpwmupvljyd`
- Application version in deployed tree: `10.89`

## Release gate and deployment

- PR #54 `release/v10.89 -> main`: merged.
- `WAWIS PR checks / targeted-checks`: SUCCESS on release HEAD `a348f8b2...`.
- Release policy validation: PASS.
- Targeted regression groups: PASS.
- Required Playwright E2E: PASS.
- Production build: PASS.
- GitHub deployment status for production merge SHA: `Vercel = success`, description `Deployment has completed`.

Direct anonymous HTTP retrieval of the production URL from the connected Vercel tooling was blocked with `403` because the active connector is not authorized to the `wawis` Vercel team scope. This is recorded as an access limitation, not hidden. Deployment identity is therefore tied to the exact GitHub main SHA and its successful Vercel status.

## Supabase post-deploy checks

Production contains the six 10.89 audit migrations:

- `20260917101824 audit_invariants`
- `20260917101825 audit_restore`
- `20260917102820 audit_push_context`
- `20260917103411 audit_delivery_atomic`
- `20260917174140 audit_staging_view_guard`
- `20260917175255 audit_protocol_retention`

The expected cron remains active:

- schedule: `17 * * * *`
- command: `select private.refresh_stale_new_jobs();`

The production Edge Functions required by the audited paths are ACTIVE. The deployed production code was inspected for the key PUSH, SMS callback and protocol e-mail fixes.

## Diagnostics after merge

Production merge time: `2026-09-17T18:29:18Z`.

At the post-deploy check there were **no new `app_diagnostic_events` after the merge time**.

The previous 24-hour diagnostic window contained older events from before the production merge, including 30 `photo.thumbnail.load.failed` events. Those are not counted as post-deploy regressions of this release.

## Staging cleanup

Temporary Supabase staging:

- name: `wawis-10-89-audit-staging`
- ref: `hlfvjbidopyraycwkbfg`
- branch id: `8dff2c11-d451-4f65-8f0f-94a12d739613`

The staging branch is no longer present in the Supabase branch list. Only production `main` remains, so the temporary branch hourly cost is no longer running.

## Security advisor follow-up

Supabase Advisor still reports older hardening warnings, including mutable `search_path` warnings and `SECURITY DEFINER` exposure warnings. Two functions reported as executable by `anon` were inspected: `admin_list_deleted_jobs()` and `job_file_can_be_deleted(text,text)`. Both contain internal authorization checks (`current_user_is_admin()` / `auth.uid()` and access checks). These warnings are retained as separate hardening follow-up and were not treated as a 10.89 rollback condition.

## Repository cleanup

- PR #53 is closed and marked as superseded by #54.
- PR #54 is merged.
- Six temporary GitHub branches named `tmp/v10.89-audit-*` remain. The connected GitHub integration available in this session does not expose branch deletion, and the local GitHub CLI is not authenticated, so they were not falsely reported as deleted. They do not affect `main` or production.

## Final status

**WAWIS 10.89 post-deploy verification: PASS**, with the Vercel-team HTTP access limitation and the separate non-blocking security-hardening notes recorded above.
