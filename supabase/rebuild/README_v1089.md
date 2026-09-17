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

At implementation time the requested project returned `Project not found`; the connected account listed only production. No staging reset, rebuild, deployment or deletion was performed. Full staging verification remains NOT VERIFIED. Keep the staging project for independent review once access is restored.
