const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { classifyRelease } = require('./release-impact.cjs');
const { uniqueCommands } = require('./test-groups.cjs');

const changedFileListPath = process.argv[2] || 'changed-files.txt';
const impactPath = process.argv[3] || 'release-impact.json';
if (!fs.existsSync(changedFileListPath) || !fs.existsSync(impactPath)) {
  throw new Error('NO-GO: brak required changed-files.txt lub release-impact.json');
}
const changedFiles = fs.readFileSync(changedFileListPath, 'utf8')
  .split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
const impact = JSON.parse(fs.readFileSync(impactPath, 'utf8'));
const expected = classifyRelease({ baseRef: impact.base_ref || 'origin/main', changedFiles });

function sameOrdered(a, b) {
  return Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((value, index) => value === b[index]);
}
for (const field of ['changed_files', 'effective_files', 'generated_only_files', 'groups', 'pr_groups', 'platforms', 'e2e']) {
  if (!sameOrdered(impact[field], expected[field])) {
    throw new Error(`NO-GO: release impact ${field} różni się od niezależnej klasyfikacji diff`);
  }
}
for (const field of ['profile', 'scope', 'needs_playwright']) {
  if (impact[field] !== expected[field]) {
    throw new Error(`NO-GO: release impact ${field} różni się od niezależnej klasyfikacji diff`);
  }
}
if (!sameOrdered(impact.groups, impact.pr_groups) || !impact.groups.length) {
  throw new Error('NO-GO: groups i pr_groups muszą być identyczną, niepustą listą');
}
uniqueCommands(impact.groups); // unknown names fail closed, before running anything
console.log(`Zmiana: ${changedFiles.length} plików · ${impact.profile} · ${impact.groups.join(', ')}`);
execFileSync(process.execPath, ['scripts/run-test-group.cjs', ...impact.groups], {
  stdio: 'inherit',
  env: { ...process.env, WAWIS_EVIDENCE_PATH: process.env.WAWIS_EVIDENCE_PATH || 'closure-evidence.json' },
});
