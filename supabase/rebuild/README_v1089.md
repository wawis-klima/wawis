# WAWIS 10.89 isolated backend rebuild

**Staging only. Never apply this baseline to production or as a regular migration.**

The authoritative order is `manifest-v1089.json`. It includes prerequisite protocol/fuel definitions, historical migrations, dependency-ordered legacy service/archive definitions, baseline policies/triggers/ACL and all audit repair migrations. It deliberately loads worker visibility before the dependent comment policy despite timestamp order. Final ACL removes inherited anonymous execution of privileged legacy RPCs.

Prepare SQL without connecting to a database:

```sh
node scripts/audit-v1089/emit-rebuild.mjs hlfvjbidopyraycwkbfg /temporary/path/rebuild.sql
```

On an EMPTY, authorized Supabase staging database, run the generated file with `psql -X -v ON_ERROR_STOP=1 "$STAGING_DATABASE_URL" -f /temporary/path/rebuild.sql`. Verify that the connection is to `hlfvjbidopyraycwkbfg` before running. `verify_audit_v1089.sql` is included. Repeat the same script to check replay behavior. The process does not drop or reset databases and does not deploy Edge Functions. Edge handler deployment/testing, actual Auth/REST/Storage, cron and multiple-connection races require separate staging verification.

Local dependency rehearsal:

```sh
node scripts/audit-v1089/rebuild-rehearsal.mjs --replay
```

This uses real PostgreSQL WASM for application SQL but substitutes platform auth/storage/cron shells and omits unsupported pgcrypto/pg_cron extension creation. It is explicitly NOT evidence of a complete Supabase rebuild. It checks dependency order, two full replays and selected catalog/ACL invariants.

The newly authorized branch is `wawis-10-89-audit-staging`, ref `hlfvjbidopyraycwkbfg`, branch ID `8dff2c11-d451-4f65-8f0f-94a12d739613`. The generator still rejects every other ref, including production and the previous inaccessible staging. The manifest now has 52 files: two additional corrections restore the staff-only view helper and remove a legacy permissive PDF deletion policy.

Real staging commands require `WAWIS_STAGING_CREDENTIALS` pointing to a private JSON file returned by `supabase branches get` (outside the repo) and `WAWIS_STAGING_ACTORS` pointing to a private output file outside the repo. Never commit either file. `staging-common.mjs` checks the exact project URL/database identity and uses the session pooler, port 5432, so per-session role/GUC and lock tests are real.

```sh
node scripts/audit-v1089/staging-rebuild.mjs
node scripts/audit-v1089/staging-gate.mjs
```

The rebuild runner generates the same SQL, removes only the psql client meta-command and executes it fail-fast twice on PostgreSQL; a failure prevents the second pass. `--reset-audit-fixtures` is explicitly destructive to application schemas on this staging only and validates audit-only Auth/jobs/Storage ownership first. Do not use it during independent review without intending to discard audit fixtures. Auth users and the staging project are not deleted. Successful pass hashes and external test evidence are under `docs/audits/v10.89/evidence/`.

PUSH testing requires the repository `send-assignment-push` function deployed to this staging and staging-only VAPID keys (`staging-push.mjs --prepare` produces a private env file outside the repo). E-mail testing runs the full handler with real Supabase Auth/PostgREST/Storage and a controlled provider adapter; it never sends to real recipients. Browser PUSH testing uses a real Service Worker but synthetic endpoints, without claiming native OS delivery. Keep this staging for independent review.
