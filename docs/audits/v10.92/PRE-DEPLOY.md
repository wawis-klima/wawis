# WAWIS 10.92 — PRE-DEPLOY

## Release identity
- release branch: `release/v10.92`
- production baseline before release: 10.91
- production Supabase: `uohziyaudbpwmupvljyd`

## RED evidence
On the 10.91 baseline, `tests/e2e/mobile-v1092-regressions.spec.js` reproduced both requested defects:
1. the real production mobile entrypoint `src/main.jsx` did not import the 10.90/10.91 width-hardening styles;
2. administrator completion still required the nameplate/manual-verification path instead of a direct admin bypass.

Both counterexamples failed before the 10.92 fix.

## GREEN evidence
Focused pre-release workflow run `35294836687` completed successfully on head
`b94dd230a40a105467c5056b3f790acbf84af06f`.

Passed checks:
- version consistency,
- worker/admin nameplate completion smoke,
- desktop/manual verification smoke,
- 10.91 + 10.92 focused regressions,
- full WebKit/iPhone mobile layout,
- production build,
- release metadata + built-dist verification.

## Backend role verification
A Supabase preview branch `wawis-10-92-staging` was created for the test, but the historical Supabase Branching pipeline stopped after the second old migration (`MIGRATIONS_FAILED`), before the application schema existed. This is the previously known Branching limitation and is not claimed as fixed by 10.92. The unusable branch was deleted immediately.

To verify the 10.92 migration against the current real schema without changing production, the exact migration logic was copied into a session-local `pg_temp` function. The test used existing administrator and worker profiles and a synthetic job id with no nameplate photos.

Result:
- administrator without nameplates: PASS,
- worker without nameplates: BLOCKED,
- worker SQLSTATE: `23514`,
- worker error prefix: `job_nameplates_incomplete`.

The temporary function and JWT test context were session-local; no persistent production object or data was changed.

## Production diagnostics before release
The last-24h error grouping included existing events from already deployed versions:
- 30 × `photos / photo.thumbnail.load.failed / THUMBNAIL_LOAD_FAILED`, latest on 10.91,
- 3 × older `app / console.error`, latest on 10.90.

These are informational under the release policy and are not events from 10.92, which is not deployed yet.

## Pre-deploy decision
**PASS — ready for the protected PR gate to `main`.**
