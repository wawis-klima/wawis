const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { classifyEffectiveFiles, classifyRelease } = require('./release-impact.cjs');
const { uniqueCommands, getReleaseGroups } = require('./test-groups.cjs');

const repo = path.resolve(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const same = (a,b) => assert.deepEqual(a,b);
const full = getReleaseGroups('full');

// CODEX C5 / G1: a PR modifying the gate itself must not run only core+infra.
for (const critical of ['scripts/release-impact.cjs', 'scripts/test-groups.cjs',
  'scripts/verify-closure-evidence.cjs', '.github/workflows/pr-checks.yml']) {
  const impact = classifyEffectiveFiles([critical]);
  same(impact.groups, full);
  same(impact.pr_groups, full);
  same(impact.e2e, ['mobile','desktop']);
}
// Shared source is used by desktop and mobile regardless of its directory.
for (const shared of ['src/modules/diagnostics.js', 'src/modules/diagnostic-privacy.js',
  'src/modules/jobs-fetch.js', 'src/lib/supabase.js']) {
  const impact = classifyEffectiveFiles([shared]);
  assert(impact.pr_groups.includes('mobile'), shared + ' missing mobile');
  assert(impact.pr_groups.includes('desktop'), shared + ' missing desktop');
  same(impact.groups, impact.pr_groups);
}
const sms = classifyEffectiveFiles(['supabase/functions/generate-service-sms-queue/index.ts']);
assert(sms.groups.includes('sms') && sms.groups.includes('roles') && sms.groups.includes('infra'));
same(sms.groups,sms.pr_groups);
const fast = classifyEffectiveFiles(['src/mobile791/styles.css']);
assert.equal(fast.profile, 'fast-ui');
assert.equal(fast.needs_playwright, false);
same(fast.groups, fast.pr_groups);
assert(!fast.groups.includes('infra'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(),'wawis-closure-1275-'));
const paths = Object.fromEntries(['impact','grouped','e2e','result','changed'].map(x=>[x,path.join(temp,x+'.json')]));
const write = (key,obj) => fs.writeFileSync(paths[key],JSON.stringify(obj,null,2)+'\n');
const head = git('rev-parse','HEAD');
const changed = git('diff','--name-only','origin/main...HEAD').split(/\r?\n/).filter(Boolean);
const impact = classifyRelease({baseRef:'origin/main',changedFiles:changed});
assert(impact.groups.length>0);
same(impact.groups,impact.pr_groups);
const gitEvidence = {
  git_sha: process.env.GITHUB_SHA || null,
  git_head_sha: head,
  git_run_id: process.env.GITHUB_RUN_ID || null,
  git_run_attempt: process.env.GITHUB_RUN_ATTEMPT || null,
};
const grouped = {
  schema_version:2,type:'grouped-checks',...gitEvidence,
  groups:impact.groups, expected_commands:uniqueCommands(impact.groups),
  commands:uniqueCommands(impact.groups).map(command=>({command,status:'passed'})),
  all_passed:true,
};
const scripts = {mobile:'scripts/run-playwright-mobile.cjs',desktop:'scripts/run-playwright-desktop.cjs'};
const e2e = {
 schema_version:2,type:'e2e', ...gitEvidence,
 platforms:impact.e2e,runs:impact.e2e.map(platform=>({platform,script:scripts[platform],status:'passed'})),
 all_passed:true,
};
const env = {...process.env,WAWIS_PR_HEAD_SHA:head};
const run = (script,args)=>spawnSync(process.execPath,[path.join(repo,script),...args],{
 cwd:repo,env,encoding:'utf8',timeout:12000,
});
const gate = ()=>run('scripts/verify-closure-evidence.cjs',
 [paths.impact,paths.grouped,paths.e2e,paths.result]);
const runner = ()=>run('scripts/run-pr-checks.cjs',[paths.changed,paths.impact]);
try {
 write('impact',impact);write('grouped',grouped);write('e2e',e2e);
 fs.writeFileSync(paths.changed,changed.join('\n')+'\n');
 const valid=gate();
 assert.equal(valid.status,0,'valid full synthetic evidence:\n'+valid.stderr+'\n'+valid.stdout);

 // Mutation: narrow test groups in a JSON file without changing source diff.
 const narrow={...impact,groups:['core'],pr_groups:['core']};
 write('impact',narrow);
 let rejected=gate();
 assert.notEqual(rejected.status,0,'forged subset passed closure gate');
 assert.match(rejected.stderr,/release impact|NO-GO|Zmieniony/i);
 rejected=runner();
 assert.notEqual(rejected.status,0,'forged subset reached actual regression runner');
 assert.match(rejected.stderr,/NO-GO|różni się/i);

 write('impact',impact);
 write('grouped',{...grouped,git_head_sha:'f'.repeat(40)});
 rejected=gate();
 assert.notEqual(rejected.status,0,'stale grouped commit should be rejected');
 assert.match(rejected.stderr,/HEAD PR/);

 write('grouped',grouped);
 write('e2e',{...e2e,git_head_sha:'f'.repeat(40)});
 rejected=gate();
 assert.notEqual(rejected.status,0,'stale E2E commit should be rejected');

 write('e2e',e2e);
 write('impact',{...impact,effective_files:[]});
 rejected=gate();
 assert.notEqual(rejected.status,0,'mutated effective files should be rejected');

 write('impact',impact);
 write('grouped',{...grouped,all_passed:false});
 rejected=gate();
 assert.notEqual(rejected.status,0,'partial grouped result should fail closed');

 console.log('PASS CODEX G1/G2 C5/C6: global/shared group selection, CSS fast path, and six CI integrity/NO-GO mutations.');
} finally {
 fs.rmSync(temp,{recursive:true,force:true});
}
