import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('NO-GO: set SUPABASE_DB_URL or DATABASE_URL for migration-history verification.');
  process.exit(2);
}

const root = path.resolve(new URL('..', import.meta.url).pathname);
const migrationDir = path.join(root, 'supabase', 'migrations');
const targetNames = [
  'sms_retry_attempt_lifecycle_v1257',
  'sms_retry_chain_attempt_pointer_v1257',
  'sms_customer_identity_count_v1257',
  'sms_snapshot_customer_identity_v1257',
];
const local = new Map();
for (const file of fs.readdirSync(migrationDir)) {
  const match = file.match(/^(\d{14})_(.+)\.sql$/);
  if (match && targetNames.includes(match[2])) local.set(match[2], match[1]);
}
assert.equal(local.size, targetNames.length, 'all tracked v12.57 migrations must exist exactly once locally');

const client = new Client({ connectionString });
try {
  await client.connect();
  const rows = (await client.query(
    `select version,name from supabase_migrations.schema_migrations where name = any($1::text[]) order by name`,
    [targetNames],
  )).rows;
  assert.equal(rows.length, targetNames.length, 'production migration registry must contain every tracked migration');
  for (const row of rows) {
    assert.equal(local.get(row.name), row.version, `${row.name}: local timestamp must equal production schema_migrations version`);
  }
  console.log('PASS: local v12.57 migration IDs match production supabase_migrations.schema_migrations');
} finally {
  await client.end();
}
