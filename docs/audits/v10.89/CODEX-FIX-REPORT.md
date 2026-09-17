# WAWIS 10.89 — completed staging verification

Continuation from `645d3bcd2b824b5acbbb0a46057b5f0d9bcf84b7` on `fix/v10.89-audit-red`, draft PR #53. Original audited baseline remains `ab3a3ad5eb2a3b346800307370f136e5d8b52c43`; no rebase or version change. The entire audit **Wklejony kod markdown(3).md**, title **WAWIS 10.89 — niezależny audyt regresyjny READ-ONLY**, was read before the original repairs. Original counterexamples, repair explanations, full commit mapping and RED logs are preserved in [the pre-staging report](CODEX-FIX-REPORT-PRE-STAGING.md) and [source audit](SOURCE-AUDIT.md). The current report supersedes its inaccessible-staging statuses.

**All required test groups below passed on the stated environments.** Real staging is `wawis-10-89-audit-staging`, ref `hlfvjbidopyraycwkbfg`, branch `8dff2c11-d451-4f65-8f0f-94a12d739613`, parent `uohziyaudbpwmupvljyd`. Production was used only for read-only catalog comparisons. No production deployment/mutation, merge, release or Ready transition occurred. PR #53 remains draft for independent review.

## New commits

- `26d16d75bbe5add018df1a6365fbe4621e23f2ab` — `chore(v10.89): pin rebuild to authorized audit staging`
- `066aac463663d457a621657525106360664fe7c9` — `fix(v10.89): close real staging rebuild and retention gaps`
- `1e1740be6f1f233abb57ba4ee1cc038d0c8c903f` — `test(v10.89): verify real staging APIs races storage and worker lifecycle`

This report is committed separately after those tested implementation commits. The final report commit/head is recorded in PR metadata and the final response.

## A01–A11

GREEN certifies the audited counterexamples and stated tests, not live customer delivery or every possible application behavior. Existing baseline RED evidence is retained; staging was not replaced with mocks.

| Finding | Baseline RED | Fix | GREEN | Mutation/control | Commit | Status | Uwagi |
|---|---|---|---|---|---|---|---|
| A01 | [name-only overwrite](evidence/baseline-A01.log) | Explicit OLD/NEW contact patches | [Real authenticated worker SQL](evidence/staging-invariants-cron.json): preserves phone 222/HQ/Branch; explicit phone/secondary street works | Baseline invariant fails; worker direct contractor UPDATE denied through REST | Original G1; staging tests `1e1740b` | BEHAVIORALLY VERIFIED GREEN | Original reassignment controls retained |
| A02 | [completed edit accepted](evidence/baseline-A02.log) | Revalidate model/serial edits | [PostgREST](evidence/staging-api.json): second model line/JW2 rejected, required photo deletion rejected | Baseline missing rejection detected | Original G1; tests `1e1740b` | BEHAVIORALLY VERIFIED GREEN | Real Storage files and photo rows |
| A03 | [E2 rejected](evidence/baseline-A03.log) | Epoch separate from endpoint/generation | [Deployed Edge→DB→real SW](evidence/staging-push.json): E1/CLEAR/E2 generation1 succeeds | Late SET/CLEAR/410 and resurrection rejected; baseline guard mutation fails | Original G2/G2b; tests `1e1740b` | BEHAVIORALLY VERIFIED GREEN | Synthetic endpoints; no OS delivery claim |
| A04 | [A/B/A](evidence/baseline-email-attempts.log), [25h duplicate](evidence/baseline-email-edge.log) | Durable identity, reconciliation, PDF version, bounded body | [Real Auth/REST/Storage + PostgreSQL](evidence/staging-email.json): A/B/A/reload/lost response/25h/concurrent handler and INSERT/replacement | Unique-index Lock observed; loser 23505; baseline registry/handler fail | Original G3; tests `1e1740b` | BEHAVIORALLY VERIFIED GREEN | Provider adapter controlled; no real mail sent |
| A05 | [SENT regresses](evidence/baseline-A05.log) | Atomic RPC locks and exact send pointer | [Three PostgreSQL sessions](evidence/staging-sms-race.json): read barrier, both lock orders, newer send; sms_log and jobs verified | Observed pg_stat_activity Lock/blocking PIDs; baseline handler fails | Original G3; tests `1e1740b` | BEHAVIORALLY VERIFIED GREEN | Callback SQL executed as service_role |
| A06 | [foreign draft](evidence/baseline-A06.log), [wrong session save](evidence/baseline-A06-save.log) | Owner/operation/tab isolation and save checks | [Actual module against Storage/REST](evidence/staging-api.json): upload/INSERT/retry one row; cross-owner photo denied; real two-tab React E2E remains green | Baseline owner fault and first-repair tab regression captured | Original G2/G2b/G2c; tests `1e1740b` | BEHAVIORALLY VERIFIED GREEN | Browser tests and real backend tests are distinguished |
| A07 | [missing archive function](evidence/baseline-A07.log), additional staging REDs below | Complete ordered sources, cron replay, staff view guard, retained PDF ACL/index | [Two identical full staging replays](evidence/staging-final-replays.json), [catalog](evidence/staging-catalog-final.json), [API](evidence/staging-api.json), [restore/cron](evidence/staging-invariants-cron.json), [devices](evidence/staging-devices.json) | Missing dependency fails; original cron replay/pending read/PDF delete failures retained | `26d16d7`, `066aac4`, `1e1740b` | BEHAVIORALLY VERIFIED GREEN | 52 files after two required corrections |
| A08 | [old false closure](evidence/baseline-A08-false-green.log) | Local executable gate plus separate external gate | [Same injected fault](evidence/gate-quality.json): old gate accepts, new rejects; [staging 7/7](evidence/staging-gate-final.log) | Historical gate exit0 vs current exit1 for same bad PUSH code | Original G4; tests `1e1740b` | BEHAVIORALLY VERIFIED GREEN | Local results never substituted for external evidence |
| A09 | [restore before photos](evidence/baseline-A09.log) | Transitional job, dependencies, validated completion/history | [Actual rebuilt backend](evidence/staging-invariants-cron.json): photos/comments/access/protocol/devices/SMS/history restored; corrupt missing-photo archive rolls back | Baseline fails; failed restore leaves no partial job or consumed archive | Original G1; extended fixture `1e1740b` | BEHAVIORALLY VERIFIED GREEN | Auth helper functions were NOT replaced in staging test |
| A10 | [LF/CRLF](evidence/baseline-A10.log), original E2E label failure | Normalize source input; queue-specific locator | [18/18 gate](evidence/post-staging-audit-gate.log), [38/38 E2E](evidence/post-staging-e2e.log) | Old smoke fails CRLF | Original G4 | BEHAVIORALLY VERIFIED GREEN | Queue/upload/delete guarantees retained |
| A11 | [five stale loaders](evidence/baseline-A11.log) | Request/session guards | [Latest gate](evidence/post-staging-audit-gate.log) and [real React E2E](evidence/post-staging-e2e.log): NEW/OLD, stale reject, account/logout/unmount | Baseline Devices mutation fails | Original G2/G4 | BEHAVIORALLY VERIFIED GREEN | Controlled transport for ordering, real components |

## Rebuild: actual failures, repairs and final proof

1. Minimal retarget changed only generator, manifest and README in its own commit. Authorized new ref succeeds; production, old ref and arbitrary ref were all rejected. Branch listing confirmed the exact new branch ID/project ref, ACTIVE_HEALTHY; SQL identity and empty application catalog were checked before mutation. Metadata get_project still returned not-found, but branch metadata and actual SQL/API connections worked.
2. Initial full rebuild succeeded; second failed with `dependent privileges exist` while Supabase's CREATE EXTENSION event trigger reapplied pg_cron grants. [Original response](evidence/staging-initial-replay.json). Avoid redundant extension creation on replay and remove postgres self-grants. No platform event trigger was disabled.
3. Populated Data API role test discovered pending users could read photos. Rebuild retained an older `current_user_can_view_job` definition. Read-only production definition required staff. [RED](evidence/staging-red-pending-read.json). New migration restores the staff check with an empty search_path and explicit ACL. Authenticated staff access remains intact.
4. Catalog comparison found an extra legacy permissive Storage DELETE policy. Actual Storage API deleted a referenced PDF; the test restored the test file before failing. [RED](evidence/staging-red-protocol-retention.json). New migration removes that legacy policy; the retained-file policy remains enforced. [Same test GREEN](evidence/staging-protocol-retention.json).
5. Final catalog comparison found a missing partial archive job index. Added `private.job_recycle_bin_job_idx` and verification. [Before](evidence/staging-catalog-comparison-before-index.json), [final comparison](evidence/staging-catalog-comparison-final.json).

The final clean application rebuild and replay used identical SQL SHA-256:

`a75ba98a17082c9159ed621e3cd707c4309fdc3611343c8cefa23e37313ef3cd`

**Pass 1 PASS; pass 2 PASS.** [Proof with connection identity/hash](evidence/staging-final-replays.json), [log](evidence/staging-rebuild-final.log). The runner generated all 52 files, removed only psql's client meta-command and sent SQL to real PostgreSQL fail-fast; any thrown SQL error stops further passes. After each repair requiring a fresh application state, reset was limited to the authorized staging public/private application schemas and owned audit Storage fixtures. It first rejected non-audit users/jobs/Storage owners. Auth/platform schemas and the project were not deleted. The final gate ran after the last clean rebuild/replay.

Catalog evidence includes tables, owners, RLS, function signatures/definer/search_path/ACL, constraints, indexes, triggers, schema grants and policies. No production table, column, function signature, constraint, index or policy is missing from the final catalog comparison. Expected additions include audit epoch/delivery columns/functions/index and historical repository `mobile_sync_receipts`/`storage_backup_queue` objects, all with RLS. These additions are listed explicitly; exact schema equality with production is not claimed. Replay plus real dependent operations verify dependency order.

## Real staging evidence

| Area | Executed result |
|---|---|
| Auth | Five real Auth accounts/sign-ins per final run. Forged user metadata Administrator still creates Oczekujący profile. Pending self-role escalation rejected. Missing-profile account remains denied. |
| PostgREST/RLS/ACL | Admin, worker, pending, missing profile and anon tested through Data API. Nonstaff cannot read protected data; worker direct contractor update denied. All app roles denied service-only SMS callback RPC. Private schema and public-table RLS assertions pass. |
| Storage | Real JW/JZ and Fuel uploads/downloads; nonstaff uploads rejected; cross-owner fuel read/write rejected; actual addFuelEntry retry reconciles one row. Required photos and referenced protocol PDFs survive deletion attempts. |
| Devices | Real delete-device RPC shifts remaining photo indexes while retaining surviving Storage paths; only unreferenced files removed via Storage API; surviving device completes with JW/JZ. |
| Restore | Actual delete/archive/restore including photos, comments, access, PDF record, devices, SMS and historical completed_at. Incomplete-photo archive rollback leaves no job and no restored marker, then valid archive restores. |
| Cron | Actual pg_cron worker executed private.refresh_stale_new_jobs, with succeeded job_run_details; a 31-day-old Nowe fixture became Niezrealizowane. Expected hourly job remains unique/active at `17 * * * *`. Temporary 1-second verification job was unscheduled. |
| SMS | Independent session-mode connections; SENT pre-read barrier; DELIVERED/SENT and SENT/DELIVERED lock orders; actual wait_event_type=Lock with blocker PIDs; both tables remain monotonic; old callback cannot modify newer-send pointer. |
| E-mail | Full repository Edge handler with real Auth/PostgREST/Storage and PostgreSQL, only provider transport controlled. A/B/A, reload, lost response, DB record aged 25h and advanced handler clock, concurrent requests, unique-index contention, replacement conflict. Each logical operation invokes provider once. |
| PUSH | Repository send-assignment-push deployed ONLY to this staging, verify_jwt=true, version 17. Staging-only VAPID keys. Actual authenticated Edge calls → DB epoch/generation → real Chrome Service Worker/IndexedDB. Fresh E2 generation1 accepted; stale SET/CLEAR/410 and old-account resurrection rejected. |

Evidence lives in `staging-api.json`, `staging-devices.json`, `staging-protocol-retention.json`, `staging-invariants-cron.json`, `staging-sms-race.json`, `staging-email.json`, `staging-push.json`. [External aggregate gate](evidence/staging-gate-final.log): **7/7 PASS**.

Fixture corrections were not application failures: uploader ID required by RLS; unique contractor name/phone; actual newline/JW2 device serialization; valid vehicle registration; Supabase client session initialization; session pooler instead of transaction pooler for GUC/role persistence; bigint overload for cron cleanup; PUSH standalone client mode. Recorded intermediate failure files are historical, superseded by final successful runs. No policy/assertion was weakened to accommodate a fixture, and no failing test was disabled.

## Final local regressions, after staging

- [Audit gate](evidence/post-staging-audit-gate.log): **18/18 PASS**.
- [Full smoke](evidence/post-staging-smoke.log): **111/111 PASS**.
- [Mutation controls](evidence/post-staging-mutation-controls.log): **11/11 detected baseline faults**; source bytes restored.
- [A08 same-fault gate control](evidence/gate-quality.json): old gate exit **0** (false acceptance); new gate exit **1** (correct rejection). Supplemental control, not counted as a failed application test.
- [E2E](evidence/post-staging-e2e.log): **38/38 PASS**, real Chrome, existing mock suite plus real React component tests.
- [Production build](evidence/post-staging-build.log): **PASS**, existing chunk-size/dynamic-import warnings. Build is not proof of behavioral repair.

Windows/Node 24.14.1; pg 8.23.0 added as pinned test devDependency, lockfile committed. CI Node 22 execution is not inferred from local results.

```powershell
# Exact staging is asserted by the scripts. Keep these files outside git.
$env:WAWIS_STAGING_CREDENTIALS='C:/private/staging-credentials.json'
$env:WAWIS_STAGING_ACTORS='C:/private/staging-actors.json'
node scripts/audit-v1089/staging-rebuild.mjs --reset-audit-fixtures
node scripts/audit-v1089/staging-gate.mjs

# Local regressions; no external credentials required.
node scripts/audit-v1089/mutation-controls.mjs
node scripts/audit-v1089/run.mjs
node scripts/audit-v1089/full-smoke.mjs
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:VITE_SUPABASE_MODE='mock'
node node_modules/@playwright/test/cli.js test --workers=1 --reporter=line
npm run build
node scripts/audit-v1089/gate-quality.mjs
```

For the Windows sandbox/host Git ownership mismatch, the previous per-process exact-worktree `safe.directory` environment override was used; no global Git trust change. Mutation/gate-quality runners must run alone because they temporarily restore historical files. Staging credentials/JWTs/private VAPID keys were kept outside the repository and are not included in evidence.

## Remaining RED / NOT VERIFIED and preservation

**Required audited counterexamples and requested test groups: no remaining RED or blocked verification.** Explicit limits retained:

- Actual Resend delivery was not sent/tested. The user-required safe controlled provider was used while database/Auth/REST/Storage were real.
- Native OS PUSH notification delivery and real provider 410 network response were not exercised. Synthetic endpoints and the actual expiry RPC tested the required lifecycle/CLEAR/late-410 invariant through the deployed Edge/real SW path as far as this staging test permits.
- This is not certification of every historical 54-scenario matrix item or live customer deployment; CI status is separate from the recorded local/staging results.
- Supabase Branching's old automatic MIGRATIONS_FAILED metadata is not the result of these manual replays; this task verified the expressly requested manual repository rebuild. No claim of repairing the automatic Branching pipeline.

NO PRODUCTION DEPLOYMENT PERFORMED

STAGING wawis-10-89-audit-staging LEFT IN PLACE FOR INDEPENDENT REVIEW

PRODUCTION MODIFIED: NO. STAGING DELETED: NO. Version remains 10.89. PR #53 remains OPEN and DRAFT; no merge, release or Ready transition. Test users/data remain on staging for independent inspection; transient cron verification job was removed.
