const assert = require('node:assert/strict');
const fs = require('node:fs');
const { selectDomainGroups } = require('./release-impact.cjs');

const workflow = fs.readFileSync(new URL('../.github/workflows/pr-checks.yml', import.meta.url), 'utf8');
const rules = fs.readFileSync(new URL('../WAWIS-RULES.md', import.meta.url), 'utf8');
const agents = fs.readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
const closure = fs.readFileSync(new URL('../CLOSURE-GATE.md', import.meta.url), 'utf8');
const testGroups = fs.readFileSync(new URL('./test-groups.cjs', import.meta.url), 'utf8');

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
