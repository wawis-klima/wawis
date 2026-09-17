# WAWIS 10.89 — fix report (in progress)

Audit: Wklejony kod markdown(3).md, read in full. Baseline: ab3a3ad5eb2a3b346800307370f136e5d8b52c43.
Branch: fix/v10.89-audit-red. No production deployment or mutation authorized/performed.

| Finding | Baseline RED | Fix | GREEN | Mutation/control | Commit | Status | Notes |
|---|---|---|---|---|---|---|---|
| A01 | Executed, evidence/baseline-A01.log | SQL migration | Local PostgreSQL WASM PASS | --baseline fails again | Group 1 | PARTIALLY VERIFIED | Name-only edit must preserve HQ/Main, secondary Branch/Other and phone 222; explicit field patches only |
| A02 | Executed, evidence/baseline-A02.log | SQL migration | Local PostgreSQL WASM PASS | --baseline fails again | Group 1 | PARTIALLY VERIFIED | Revalidate model/serial changes of completed jobs, including multi-split |
| A03 | Pending | Pending | Pending | Pending | — | NOT VERIFIED | E1 generation 1 → CLEAR → E2 generation 1; reject stale E1 SET/CLEAR/410 |
| A04 | Pending | Pending | Pending | Pending | — | NOT VERIFIED | A/B/A registry; lost provider response and retry 25h; immutable PDF and body timeout |
| A05 | Pending | Pending | Pending | Pending | — | NOT VERIFIED | Delayed SENT after DELIVERED; new send between callbacks |
| A06 | Pending | Pending | Pending | Pending | — | NOT VERIFIED | A pending → B; owner at restore/retry/save/cleanup; stable retry, distinct identical fills, tabs |
| A07 | Pending | Pending | Pending | Pending | — | NOT VERIFIED | Empty DB → repo-only rebuild; inventory, replay, roles and storage |
| A08 | Pending | Pending | Pending | Pending | — | NOT VERIFIED | Replace unsupported behavioral claims with executable counterexamples |
| A09 | Executed, evidence/baseline-A09.log | SQL migration | Local PostgreSQL WASM PASS | --baseline fails again | Group 1 | PARTIALLY VERIFIED | Delete completed job → transactional restore including photos/history and validated completion |
| A10 | Pending | Pending | Pending | Pending | — | NOT VERIFIED | LF/CRLF parity; E2E queue contract independent of network quality label |
| A11 | Pending | Pending | Pending | Pending | — | NOT VERIFIED | OLD after NEW resolve/reject, unmount/logout/account switch; reproduce adjacent loaders |

## Environment evidence

Staging ref wnctellcoznmgwcpzztm: get_project returns Project not found. Parent list_branches returns only main (uohziyaudbpwmupvljyd). Awaiting access/correct ref; do not substitute production.

NO PRODUCTION DEPLOYMENT PERFORMED
STAGING NOT DELETED. Requested staging currently inaccessible; no claim of completed rebuild.

## Group 1 evidence and scope

Install test runtime: `npm ci --prefix scripts/audit-v1089 --ignore-scripts`.
For each A01/A02/A09: `node scripts/audit-v1089/invariants.mjs A01` (replace ID); baseline/ablation: add `--baseline`.
Baseline logs were captured BEFORE creating repair migrations. Initial uncaught failures additionally exposed Node 24 Windows UV_HANDLE_CLOSING on shutdown; concise error handling subsequently yields deterministic exit 1 without changing test assertions.

A01: name-only preserves phone 222 and HQ; explicit phone 333 changes only phone; secondary street edit changes secondary address only. Reassignment skips synchronization instead of copying a previous contractor's snapshot. No RLS grants added.
A02: revalidation uses the same SQL requirement parser for model and serial changes while completed. Tests reject a second split, additional JW2 and deleting required JZ.
A09: temporary W trakcie, dependent rows, validated final status, then historical metadata. Local test restores two photos, verifies historical completed_at with the real completion-metadata trigger, and rejects a repeated restore. Full production trigger/dependency/Storage parity and transactional rollback scenarios remain pending; do not interpret this fixture as full backend coverage.

Role regression: `node scripts/audit-v1089/roles.mjs` imports selected audit-time production functions and policies (recorded fixtures), applies contact repair and checks admin/worker/pending/no-profile/anon. PASS. This is a local selected role matrix, not staging REST authorization proof.

Current limitation: staging access absent. Required live concurrency/rebuild/role tests have NOT run. A01/A02/A09 remain PARTIALLY VERIFIED pending broader contracts.
