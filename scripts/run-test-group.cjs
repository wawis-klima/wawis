const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { GROUPS, uniqueCommands } = require('./test-groups.cjs');

const evidencePath = String(process.env.WAWIS_EVIDENCE_PATH || '').trim();
let evidence = null;

function writeEvidence() {
  if (!evidencePath || !evidence) return;
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function run(command) {
  process.stdout.write(`\n> ${command}\n`);
  const entry = { command, status: 'running' };
  evidence.commands.push(entry);
  writeEvidence();
  try {
    execSync(command, {
      stdio: 'inherit',
      env: process.env,
      shell: true,
    });
    entry.status = 'passed';
    writeEvidence();
  } catch (error) {
    entry.status = 'failed';
    entry.exit_code = Number.isInteger(error?.status) ? error.status : 1;
    writeEvidence();
    throw error;
  }
}

const args = process.argv.slice(2).filter(Boolean);
const groupNames = args.length ? args : ['core'];

for (const groupName of groupNames) {
  if (!GROUPS[groupName]) {
    console.error(`Unknown WAWIS test group: ${groupName}`);
    process.exit(2);
  }
}

const commands = uniqueCommands(groupNames);
evidence = {
  schema_version: 1,
  type: 'grouped-checks',
  groups: groupNames,
  commands: [],
  all_passed: false,
};
writeEvidence();

console.log(`WAWIS grouped checks: ${groupNames.join(', ')} (${commands.length} unique commands)`);

try {
  for (const command of commands) run(command);
  evidence.all_passed = true;
  writeEvidence();
  console.log(`WAWIS grouped checks GO: ${groupNames.join(', ')}`);
} catch (error) {
  evidence.all_passed = false;
  writeEvidence();
  console.error(`WAWIS grouped checks NO-GO: ${groupNames.join(', ')}`);
  process.exit(error?.status || 1);
}
