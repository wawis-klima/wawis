const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { selectDomainGroups } = require('./release-impact.cjs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const workflow = read('.github/workflows/pr-checks.yml');
const rules = read('WAWIS-RULES.md');
const agents = read('AGENTS.md');
const closure = read('CLOSURE-GATE.md');
const testGroups = read('scripts/test-groups.cjs');
const migrationDir = path.join(root, 'supabase', 'migrations');
const migrationFiles = fs.readdirSync(migrationDir).filter((name) => /^\d{14}_.+\.sql$/i.test(name));
const byVersion = new Map();
for (const file of migrationFiles) {
  const version = file.slice(0, 14);
  const files = byVersion.get(version) || [];
  files.push(file);
  byVersion.set(version, files);
}
const duplicateMigrationVersions = [...byVersion.entries()].filter(([, files]) => files.length > 1);

assert.ok(selectDomainGroups(['src/modules/sms.js']).includes('sms'));
assert.ok(selectDomainGroups(['supabase/functions/send-service-sms/index.ts']).includes('sms'));
assert.match(workflow, /Verify Closure Gate/);
assert.match(workflow, /wawis-closure-evidence/);
assert.match(workflow, /closure-gate-result\.json/);
assert.match(rules, /Closure Gate/);
assert.match(agents, /test regresyjny/);
assert.match(closure, /Kontrprzykład/);
assert.match(closure, /nie może być zamknięta wyłącznie testem statycznym/i);
assert.match(testGroups, /sms:\s*\[/);
assert.deepEqual(
  duplicateMigrationVersions,
  [],
  `Duplicate Supabase migration versions are forbidden: ${duplicateMigrationVersions.map(([version, files]) => `${version} => ${files.join(', ')}`).join(' | ')}`,
);

console.log('PASS: global WAWIS Closure Gate is wired fail-closed and SMS has an explicit domain group');
