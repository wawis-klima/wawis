const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root=path.resolve(__dirname,'..');
const migrationDir=path.join(root,'supabase','migrations');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'supabase','rebuild','manifest-v1089.json'),'utf8'));
const files=new Set(fs.readdirSync(migrationDir));
const expected=[
  '20261006051947_sms_retry_attempt_lifecycle_v1257.sql',
  '20261006054129_sms_retry_chain_attempt_pointer_v1257.sql',
  '20261006054752_sms_customer_identity_count_v1257.sql',
  '20261006055831_sms_snapshot_customer_identity_v1257.sql',
];
const superseded=[
  '20261006070000_sms_retry_attempt_lifecycle_v1257.sql',
  '20261006074500_sms_retry_chain_attempt_pointer_v1257.sql',
  '20261006083000_sms_customer_identity_count_v1257.sql',
  '20261006080000_sms_snapshot_customer_identity_v1257.sql',
];
for(const file of expected) assert.equal(files.has(file),true,`missing production-aligned migration ${file}`);
for(const file of superseded) assert.equal(files.has(file),false,`superseded migration timestamp must be absent: ${file}`);
assert.equal(manifest.migrationCoverageFrom,'20261006000000');
for(const file of expected) {
  assert.equal(manifest.files.includes(`supabase/migrations/${file}`),true,`rebuild manifest missing ${file}`);
}
console.log('PASS: v12.57 migration IDs align with production registry map and fresh rebuild manifest');
