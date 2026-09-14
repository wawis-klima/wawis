const { execSync } = require('node:child_process');
const { GROUPS, uniqueCommands } = require('./test-groups.cjs');

function run(command) {
  process.stdout.write(`\n> ${command}\n`);
  execSync(command, {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  });
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
console.log(`WAWIS grouped checks: ${groupNames.join(', ')} (${commands.length} unique commands)`);

try {
  for (const command of commands) run(command);
  console.log(`WAWIS grouped checks GO: ${groupNames.join(', ')}`);
} catch (error) {
  console.error(`WAWIS grouped checks NO-GO: ${groupNames.join(', ')}`);
  process.exit(error?.status || 1);
}
