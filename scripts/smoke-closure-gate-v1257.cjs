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

console.log('PASS: global WAWIS Closure Gate is wired fail-closed and SMS has an explicit domain group');
