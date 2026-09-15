const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { selectDomainGroups } = require('./release-impact.cjs');

const changedFileListPath = process.argv[2] || 'changed-files.txt';
const impactPath = process.argv[3] || 'release-impact.json';
const changedFiles = fs.existsSync(changedFileListPath)
  ? fs.readFileSync(changedFileListPath, 'utf8').split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
  : [];

let impact = null;
if (fs.existsSync(impactPath)) {
  impact = JSON.parse(fs.readFileSync(impactPath, 'utf8'));
}

const groups = Array.isArray(impact?.pr_groups) && impact.pr_groups.length
  ? impact.pr_groups
  : selectDomainGroups(changedFiles);

console.log(`Changed files (${changedFiles.length}):`);
changedFiles.forEach((file) => console.log(`- ${file}`));
if (impact) {
  console.log(`Impact: ${impact.profile} / ${impact.scope}`);
  console.log(`Effective files: ${(impact.effective_files || []).length}`);
}
console.log(`Selected WAWIS PR groups: ${groups.join(', ')}`);

execFileSync(process.execPath, ['scripts/run-test-group.cjs', ...groups], {
  stdio: 'inherit',
  env: process.env,
});
