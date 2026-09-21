import {spawnSync} from 'node:child_process';
// Explicit opt-in credentials and exact staging validation happen in each child.
const cases=['staging-api','staging-storage-retention','staging-devices','staging-invariants','staging-sms-race','staging-email','staging-push'];
for(const name of cases){const result=spawnSync(process.execPath,[`scripts/audit-v1089/${name}.mjs`],{stdio:'inherit',env:process.env});if(result.status!==0){process.exitCode=1;throw new Error(`Staging gate stopped at ${name}, exit ${result.status}`);}}
console.log(`External staging gate: ${cases.length}/${cases.length} passed; provider email transport controlled; no OS push delivery claim.`);
