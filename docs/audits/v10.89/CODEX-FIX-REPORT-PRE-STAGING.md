# WAWIS 10.89 — repair evidence and remaining verification

Audit file: **Wklejony kod markdown(3).md**, title **WAWIS 10.89 — niezależny audyt regresyjny READ-ONLY**. Read in full before runtime edits, including reproductions, F1–F13, N1–N9, the 54-scenario matrix, regressions, production/repository differences and repair groups. Copy: [SOURCE-AUDIT.md](SOURCE-AUDIT.md). Its read-only instructions describe the earlier audit; the current user explicitly authorized these repairs, commits, push and draft PR.

Baseline: `ab3a3ad5eb2a3b346800307370f136e5d8b52c43`. Historical comparison: `74b895c849cdb7644250acf0de7933fc9ef7f1a5`. Branch: `fix/v10.89-audit-red`, created directly from baseline, without rebase. Version remains 10.89. Tested implementation head: `56d7302908b76b62e47460dfb98e1afb83e6ab10`; subsequent report-only commit does not alter tested code. Final head and all commits are in the draft PR.

**The audit is NOT closed.** Local counterexamples, full smoke, E2E and build pass. Requested staging is inaccessible. Fresh Supabase rebuild, live roles/ACL/Storage verification and multi-connection PostgreSQL races have NOT run. PostgreSQL WASM and controlled transports do not replace those checks.

## Checklist

Evidence paths are relative to this directory. GREEN means the specified counterexample was executed, not complete platform certification. Commit aliases resolve to full SHAs below.

| Finding | Baseline RED | Fix | GREEN | Mutation/control | Commit | Status | Uwagi |
|---|---|---|---|---|---|---|---|
| A01 | [baseline-A01](evidence/baseline-A01.log): phone 222 overwritten | OLD/NEW patch; selected address; reassignment boundary | Actual SQL preserves phone/HQ/Branch, explicit edits work | Baseline SQL fails same assertion | G1 | BEHAVIORALLY VERIFIED GREEN | Selected local RLS matrix passes; live roles unverified |
| A02 | [baseline-A02](evidence/baseline-A02.log): completed edit accepted | Revalidate model/serial changes | SQL rejects second split/JW2 and required-photo deletion | Baseline misses expected rejection | G1 | BEHAVIORALLY VERIFIED GREEN | Staging trigger parity unverified |
| A03 | [baseline-A03](evidence/baseline-A03.log): new E2 rejected | Separate epoch, endpoint, generation | Guard + SQL lifecycle/stale events pass | Old guard rejects legal E2 | G2, G2b | PARTIALLY VERIFIED | New full deployed Edge/SW/OS flow unverified |
| A04 | [registry](evidence/baseline-email-attempts.log), [25h](evidence/baseline-email-edge.log) | Durable owner registry; reconcile pending; PDF identity; body timeout | A/B/A, reload, lost response, 25h, replacement, stalled body | Old registry and full handler fail separately | G3 | PARTIALLY VERIFIED | Live provider and multi-connection competing INSERTs unverified |
| A05 | [baseline-A05](evidence/baseline-A05.log): late SENT regresses | Atomic RPC and exact send pointer | Handler barrier + SQL, both orders/new send | Old handler regresses | G3 | PARTIALLY VERIFIED | Real PostgreSQL lock contention unverified |
| A06 | [owner](evidence/baseline-A06.log), [save](evidence/baseline-A06-save.log) | Owner/operation keys; tab pointer; stable retry; auth checks | Real module and real React two-tab/account flow | Baseline leaks A; first-repair tab regression detected and fixed | G2, G2b, G2c | BEHAVIORALLY VERIFIED GREEN | Controlled backend; actual photo Storage/RLS unverified |
| A07 | [baseline-A07](evidence/baseline-A07.log): missing archive function | 50-file manifest, missing sources, final ACL, catalog verification | Two local replays, delete/restore/rollback | Missing source fails CREATE TRIGGER | G4 | PARTIALLY VERIFIED | Complete Supabase rebuild NOT VERIFIED |
| A08 | [false-green](evidence/baseline-A08-false-green.log): old script claims closure | Label source checks; execute counterexamples in smoke | 18/18; aggregate gate rejects faults | 11 detected faults; negative gate exit 1 | G4 | PARTIALLY VERIFIED | Baseline evidence is a false PASS, not an exit-1 test; external contracts remain unverified |
| A09 | [baseline-A09](evidence/baseline-A09.log): job_nameplates_incomplete | Transitional restore, dependencies, validated completion, history | Full local schema delete/restore/history and rollback | Baseline restore fails before photos exist | G1, G4 | BEHAVIORALLY VERIFIED GREEN | Actual Storage/Supabase unverified |
| A10 | [LF/CRLF](evidence/baseline-A10.log), [E2E baseline](evidence/baseline-e2e-original-audit.log) | Normalize input; network quality independent locator | LF/CRLF both pass; 38/38 E2E | Old smoke fails CRLF | G4 | BEHAVIORALLY VERIFIED GREEN | Queue/upload/delete assertions retained |
| A11 | [baseline-A11](evidence/baseline-A11.log): five loaders stale | Request/session scope and post-await guards | Five real loaders + actual Devices React test | Old Devices loader fails NEW/OLD | G2, G4 | BEHAVIORALLY VERIFIED GREEN | Controlled RPC transport |

## Commit mapping

- G1 `9e59c80cad460c90e884ab73611f2923610acc4e` — `fix(v10.89): protect contractor and completed-job invariants`
- G2 `feed3fef5514a327fc7347383050e1b7596e6b07` — `fix(v10.89): isolate user lifecycle and stale async state`
- G3 `c7d5c38334f2bc0a256583f6d0388af78368eaf7` — `fix(v10.89): make protocol email and SMS delivery idempotent`
- G2b `b738d5bfa1ff1d2775a7742cc5724f083f120191` — `fix(v10.89): preserve fuel operations across concurrent tabs`
- G2c `da2b090ee46e6c5025ff8176ed9a9b28d905917d` — `fix(v10.89): recheck fuel ownership at final save boundary`
- G4 `56d7302908b76b62e47460dfb98e1afb83e6ab10` — `test(v10.89): make rebuild and audit gate executable`

## Per-finding reproduction and changes

Commands run from repository root. For source-driven cases, baseline commands were executed before editing the corresponding runtime files. `mutation-controls.mjs` reproduces them after repair by obtaining individual baseline files with `git show ab3a3ad5eb2a3b346800307370f136e5d8b52c43:<path>`, checking the expected failure reason, and restoring current bytes in `finally`. Run it alone on an idle worktree, not concurrently with tests/builds/edits. SQL controls use the recorded baseline definitions or omit repair migrations.

### A01 — contact snapshot overwrite (P1)

Counterexample: contractor HQ/Main, secondary Branch/Other, current phone 222; job points to Branch with stale phone 111; name-only update overwrites contractor data. Baseline command `node scripts/audit-v1089/invariants.mjs A01` exited 1 (`name-only must preserve`). Repeat historical control with `--baseline`.

Responsible/changed source: contact-sync function replaced by `supabase/migrations/20260917101824_audit_invariants.sql`. Compare OLD/NEW, lock contractor, patch only explicit changes, distinguish primary/secondary addresses. Reassignment skips copying the previous contractor snapshot. No expanded worker grants.

GREEN: same command; phone 222 and both addresses preserved, explicit phone/street edits affect only intended fields, reassignment followed by explicit edit works. `node scripts/audit-v1089/roles.mjs` executes selected recorded production RLS/functions: admin retained; worker direct update denied; pending/no-profile/anon denied. Baseline control fails again. G1. Live Supabase role matrix remains unverified.

### A02 — completed device edit (P2)

Counterexample: complete valid JW/JZ job, then change device fields to require another split/JW2; baseline permits an invalid completed job. Baseline `node scripts/audit-v1089/invariants.mjs A02` failed `Missing expected rejection`; use `--baseline` to repeat.

Responsible/changed source: completion guard in `20260917101824_audit_invariants.sql`. Revalidate completed jobs on model/serial changes using the existing requirement parser, retaining global N2. GREEN same command rejects second split, additional JW2 and deleting required JZ. Baseline control fails. G1. Actual SQL, not text matching; no staging parity claim.

### A03 — PUSH context (P1)

Counterexample: A/E1 generation 1 → logout/CLEAR → B/E2 generation 1; baseline global terminal floor rejects E2. Baseline/GREEN command `node scripts/audit-v1089/push-context.mjs`; baseline fails `fresh E2 generation 1`.

Changed sources: `public/push-context-guard.js`, `public/push-sw.js`, `src/mobile791/modules/push-lifecycle-v1078.js`, `push-subscriptions.js`, `supabase/functions/send-assignment-push/index.ts`, `20260917102820_audit_push_context.sql`. A private sequence assigns ordered context epochs independently of endpoint generations. SET/CLEAR carries endpoint/epoch/generation; terminal tombstones prevent resurrection. Edge verifies active owner/generation before returning epoch. Expired endpoint replacement does not reuse old context metadata.

GREEN also `node scripts/audit-v1089/push-db.mjs`: real SQL creates separate contexts at generation 1; old 410 leaves E2 active; disabled context cannot revive. Guard rejects late SET/CLEAR and old-account resurrection. Baseline guard mutation fails. G2/G2b. Existing browser session/PUSH tests passed; the newly coordinated database→Edge→SW→OS path has not been deployed or verified end to end.

### A04 — protocol e-mail operation (P1)

Counterexamples: pending A/B/A loses A's UUID; provider accepts, response is lost, retry after 25h sends a second copy after provider retention expires. Baseline `node scripts/audit-v1089/email-attempts.mjs` and `node scripts/audit-v1089/email-edge.mjs` both failed their corresponding assertions before repair.

Changed sources: `src/mobile791/modules/job-protocol-email.js`, `supabase/functions/send-job-protocol-email/index.ts`, `20260917103411_audit_delivery_atomic.sql`. Durable registry is namespaced by owner and logical version. Pending operation cannot be discarded by force-new. Server records PDF path/signing version and uses a pending-version unique index to coordinate keys. Existing sending operation only reconciles; it NEVER repeats provider POST. Errors after provider start stay uncertain. Timeout includes response body. Replacement PDF conflicts with an existing attempt.

GREEN: both commands plus `node scripts/audit-v1089/email-edge.mjs --body-timeout`. Real module reload preserves identity. Full handler runs with types stripped and controlled 24h-TTL provider; lost response followed by 25h retry yields one delivery. Changed PDF returns conflict; non-terminating body returns bounded pending response (test timer shortened, runtime timeout unchanged). Baseline registry and handler controls independently fail. G3.

Limitations: Edge database/provider transports controlled, no real mail sent. Unique index executes in SQL rebuild but competing multi-connection INSERTs have not run. Unknown provider acceptance can require operator/provider confirmation indefinitely; no automatic eventual-delivery claim.

### A05 — SMS monotonic callback (P1)

Counterexample: SENT reads and pauses, DELIVERED writes, resumed SENT regresses. Baseline `node scripts/audit-v1089/sms-race.mjs` executes actual extracted handler and fails `delayed SENT cannot regress DELIVERED`.

Changed sources: `supabase/functions/smsapi-delivery-webhook/index.ts`, `20260917103411_audit_delivery_atomic.sql`. Service-only `apply_sms_delivery_atomic` locks log/job, applies rank under lock and updates job only when `last_sms_log_id` matches the exact send. New sends change pointer; stale callback cannot modify them. RPC failure/missing result returns failure, covered behaviorally in `smoke-smsapi-webhook-security-v1085.mjs`.

GREEN same race command: barrier delays SENT while DELIVERED executes actual SQL, then resumes; both serial orders, new-send pointer and sms_log/jobs are checked. Baseline handler mutation fails. G3. PGlite serializes SQL; real multi-session lock contention/deadlock behavior remains NOT VERIFIED.

### A06 — fuel ownership and identity (P1)

Counterexample: A leaves pending attempt, logout, B opens Fuel on same origin and receives A's entryId/photoPath/liters/odometer. Baseline commands `node scripts/audit-v1089/fuel-owner.mjs` and `node scripts/audit-v1089/fuel-save-owner.mjs` failed because B restored A and save accepted A with session B.

Changed sources: `src/components/fuel/FuelPanelBase.jsx`, `src/modules/fuel.js`, both App callers. Store owner and operation-specific localStorage keys, per-tab sessionStorage pointer, expected-operation cleanup. UI distinguishes resume from separate new fill, preserving uncertain operations. Owner checked before restore/retry/upload/INSERT; result owner and photo path checked. React keyed by user; stale progress/completion guarded. G2c adds final INSERT owner check and post-PUSH guard.

GREEN: `node scripts/audit-v1089/fuel-owner.mjs`, `fuel-save-owner.mjs`, `fuel-tabs.mjs`, `fuel-retry.mjs` (all in the same directory). Actual module retry/concurrent same-ID calls reconcile one logical INSERT; separate identical fills use two IDs/rows in controlled store. First repair's shared pointer failed two-tab test; [red-A06-tabs-after-group2](evidence/red-A06-tabs-after-group2.log) records it, G2b fixes it. Actual React/Chrome test uses two tabs, identical separate fills, reload/retry, account B empty fields/no resume, account A pending recovery. See `tests/e2e/audit-v1089.spec.js`. Baseline owner control fails. G2/G2b/G2c; live RLS/photo Storage still unverified.

### A07 — complete repository sources (P1)

Counterexample: CREATE TRIGGER references missing `private.archive_job_before_delete()`. Baseline `node scripts/audit-v1089/rebuild-dependency.mjs --baseline` exits 1. Other listed service/archive sources and private dependencies compared through read-only production catalog/definition queries.

Changed files: `supabase/rebuild/legacy_service_archive_v1089.sql`, `manifest-v1089.json`, `audit_final_acl.sql`, `verify_audit_v1089.sql`, `README_v1089.md`; generator/rehearsal scripts. Added claim/confirm SMS, private claims/recycle tables, archive/list/restore/file-retention functions and dependencies discovered during SQL replay: access/save/delete RPCs, device list RPCs, photo audit and signup trigger. Reviewed search_path/qualification, definer/invoker, owners, ACL/dependencies. Final ACL revokes anonymous privileged RPC and private app-role access. Signup ignores forged admin metadata; no worker contractor access expansion.

GREEN: `node scripts/audit-v1089/rebuild-dependency.mjs`; `node scripts/audit-v1089/rebuild-rehearsal.mjs --replay`. All 50 ordered repository SQL files including audit migrations execute twice. Catalog checks cover required signatures, RLS/ACL, archive trigger and retained storage policy. Backend fixture performs delete→archive→restore photos/comments/protocol/history and rollback on missing photos. Missing-source control fails actual CREATE TRIGGER. Generator `node scripts/audit-v1089/emit-rebuild.mjs wnctellcoznmgwcpzztm ../staging-rebuild-v1089.sql` succeeded without DB connection; another ref is rejected.

G4. This is NOT complete Supabase rebuild evidence: real SQL uses platform auth/storage/cron shells and omits extension creation. HTTP Auth/REST, actual Storage, cron workers, multi-session execution and full live catalog parity require staging. README gives the fresh authorized process; no destructive reset/manual application DDL was performed.

### A08 — test-quality false assurance (P2)

Baseline `node scripts/smoke-audit-fixes-v1088.mjs` returned 0 and claimed behavioral closure while executable counterexamples failed. Preserved false PASS is not mislabeled an exit-1 baseline. Changed script labels source checks auxiliary and invokes `scripts/audit-v1089/run.mjs`; root lockfile pins PGlite 0.5.8.

GREEN: 18/18 executable local scenarios. `node scripts/audit-v1089/mutation-controls.mjs` detects 11 faults at expected assertions. `node scripts/audit-v1089/run.mjs --control` returns **1**, 15/18 pass with three invariant faults detected. No disabled tests or broad closure claim. G4. PARTIALLY VERIFIED records the original false-PASS evidence form and unverified external contracts.

### A09 — completed-job restore ordering (P1)

Counterexample: baseline inserts completed job before photos, BEFORE INSERT raises `job_nameplates_incomplete`. Baseline `node scripts/audit-v1089/invariants.mjs A09` fails; `--baseline` repeats using recorded exact live baseline restore.

Changed source: `20260917101825_audit_restore.sql`, included by manifest. Temporary W trakcie job, dependencies/photos, validated completion, separate historical metadata update so normal trigger does not overwrite history. RPC transaction retained; N2 never globally disabled.

GREEN same invariant command plus `rebuild-rehearsal.mjs --replay`: actual delete/restore, photos/comments/protocol/status/history; repeated restore rejects. Incomplete archive failure leaves no partial job and does not consume archive; repaired archive subsequently restores. Baseline control fails. G1/G4. Actual Storage/Supabase role matrix remains unverified.

### A10 — CRLF and queue locator (P2)

Baseline `node scripts/audit-v1089/eol.mjs` runs actual 10.86 smoke with LF then CRLF: exit 0 then exit 1. `scripts/smoke-audit-fixes-v1086.mjs` now normalizes inputs before source assertions, without runtime workaround. GREEN same command: both 0; baseline file mutation fails CRLF.

`tests/e2e/mobile-photo-two-sessions.spec.js` matches connection label independently of Dobre/Średnie and retains Wszystko wysłane, upload, admin visibility, deletion and cross-session synchronization assertions. Original audit evidence: 35/36 with exactly the label failure; current full suite: 38/38 (two new tests). G4.

### A11 — stale Devices and adjacent loaders (P1)

Counterexample: OLD starts, NEW starts/resolves, OLD overwrites NEW. Baseline `node scripts/audit-v1089/loaders.mjs` reproduced in desktop/mobile Devices, desktop/mobile Contractors and Fuel before fixes.

Changed files: both DevicesPanels, both ContractorsPanels, FuelPanelBase, App callers, `src/modules/async-scope.js`, `src/hooks/usePanelLoadGuard.js`. Request predicates tied to session; account/auth/unmount invalidate scope; await/error/final setters reject stale requests. GREEN same command checks old resolve/reject and closed scopes/loading/error; actual React Devices E2E covers NEW/OLD, account switch with stale reject, logout/unmount. Baseline Devices mutation fails. G2/G4. Controlled RPC/setter evidence is not live backend testing.

## Final commands/results

Windows, Node 24.14.1, npm 11.11, Chrome. CI uses Node 22; CI results not claimed. Installed from lockfile with `npm ci --ignore-scripts --include=optional`; no version/release-policy/workflow changes.

```powershell
# Only for known sandbox/host ownership mismatch; no global Git setting changed.
$env:GIT_CONFIG_COUNT='1'
$env:GIT_CONFIG_KEY_0='safe.directory'
$env:GIT_CONFIG_VALUE_0='C:/Users/wasik/Documents/Codex/2026-09-17/files-pasted-by-the-user-wawis/work/wawis-fix'
node scripts/audit-v1089/run.mjs
node scripts/audit-v1089/mutation-controls.mjs
node scripts/audit-v1089/run.mjs --control # EXPECT exit 1
node scripts/audit-v1089/full-smoke.mjs
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:VITE_SUPABASE_MODE='mock'
node node_modules/@playwright/test/cli.js test --workers=1 --reporter=line
npm run build
```

- [Gate](evidence/green-audit-gate.log): **18/18 PASS**; final full smoke executes latest gate too.
- [Mutation controls](evidence/mutation-controls.log): **11/11 faults detected**, bytes restored; [negative gate](evidence/mutation-gate.log): expected **exit 1**, 15/18.
- [Full smoke](evidence/full-smoke-final.log): **111/111 PASS**, every unique existing full release-group command, no early termination; [JSON results](evidence/full-smoke-results.json).
- [E2E](evidence/e2e-final.log): **38/38 PASS**, Chrome, one worker, mock backend.
- [Build](evidence/build-final.log): **PASS**, existing chunk-size/dynamic-import warnings. Not behavioral proof.
- Latest local rebuild/restore/replay evidence is inside final gate/full-smoke logs. Supabase staging rebuild: **NOT VERIFIED**.

Intermediate failures retained: initial smoke 107/111 (old PUSH select assertion, missing mock e-mail auth, old SMS implementation assertions); updated tests preserve guarantees, including executed RPC error handling. A later 109/111 hit Git ownership; 110/111 found missing auth.users platform shell in small dependency fixture. Both addressed, all 111 rerun. New Fuel browser fixture initially recreated a diagnostic callback each render and timed out; stable callback fixed fixture, followed by two-test and full-suite PASS. No failing test disabled. Raw logs retain formatting/trailing whitespace. No claim that all 54 original audit scenarios were fully executed.

## Staging blocker and remaining review

Requested `wawis-10-89-rebuild`, ref `wnctellcoznmgwcpzztm`, branch `73b1e422-b2de-4eed-8a2c-bfd275eb7ab6`. Repeated read-only get_project returned **Project not found**; connected list_projects exposed only production, parent list_branches only main. User asked for access/correct ref. No replacement staging, reset/rebuild/deployment/deletion, or production substitution performed.

Required remaining work after access restoration:

1. Fresh Supabase rebuild and second replay; actual inventory/owners/search_path/grants/triggers/policies/RLS/Storage parity.
2. Live Auth/PostgREST role matrix (admin/worker/pending/no-profile/anon), restore/history/rollback, Storage dependencies and cron behavior.
3. Multi-connection SMS callback barriers/locks/new-send isolation; competing e-mail operation/version INSERTs and reconciliation.
4. Staging deployed Edge→DB→SW PUSH lifecycle/410/logout, remaining live Fuel/loader/provider transport checks. No real SMS/e-mail/PUSH sent by these tests.

NO PRODUCTION DEPLOYMENT PERFORMED

STAGING wawis-10-89-rebuild LEFT IN PLACE FOR INDEPENDENT REVIEW

The preservation statement means no deletion was performed. Inaccessibility prevents asserting existence/availability or successful rebuild. Production modified: **NO**, including no rollback mutation tests. Staging deleted: **NO**. No merge, Ready transition, release or production deployment.
