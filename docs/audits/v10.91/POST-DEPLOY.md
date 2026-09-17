# WAWIS 10.91 — post-deploy closeout

## Release

- Final release head: `f2b079a369a77cc785d24a76b2d8ddace02af267`.
- Final WAWIS PR checks run #202: PASS, including release policy, fail-closed checks, targeted regressions, required Playwright E2E and production build.
- PR #58 merged to `main` as `faae096e73030553680b83a2469a8de687907e27` at `2026-09-17T20:11:11Z`.
- Vercel status for the exact production merge SHA: SUCCESS.
- The exact deployed tree contains `app-version.json = 10.91` and Service Worker cache `wawis-app-shell-v10.91`.

## Fixed in 10.91

### Mobile detail width

10.90 already wrapped long text, but some nested grids/actions could still grow the document width. 10.91 adds a final mobile width guard covering the whole expanded job card, nested detail grids, actions, device sections and value containers. A focused iPhone 14 Playwright regression verifies that a deliberately long e-mail and address do not create horizontal viewport overflow.

### Mobile admin manual nameplate verification

Desktop already supported manual JZ/JW verification. 10.90 also had the database records and backend completion guard, but mobile admin did not have controls to create or revoke those records.

10.91 adds `Potwierdź ręcznie / Cofnij ręczne` next to the affected JZ/JW in mobile job details. For an administrator, a required unit is complete when it has either a ready physical nameplate photo or an explicit manual verification record. Worker completion behavior remains unchanged: workers still require physical photos.

No new Supabase schema or migration was required in 10.91; it reuses the production `nameplate_manual_verifications` model and completion guard from 10.90.

## Verification

Pre-release one-shot check:

- version consistency — PASS;
- existing nameplate finish smoke — PASS;
- focused 10.91 Playwright regressions — 2/2 PASS;
- production build — PASS;
- release metadata verification — PASS.

Final PR check #202:

- release policy — PASS;
- fail-closed cases — PASS;
- targeted regression groups — PASS;
- required Playwright E2E — PASS;
- production build — PASS.

## Diagnostics

From production merge time `2026-09-17T20:11:11Z` to the closeout check:

- `app_diagnostic_events`: 0 new events;
- `error` / `fatal`: 0.

## Status

**WAWIS 10.91 CLOSED / PRODUCTION VERIFIED.**
