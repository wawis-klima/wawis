const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { uniqueCommands } = require('./test-groups.cjs');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wawis-closure-negative-v1258-'));
const impactPath = path.join(temp, 'impact.json');
const groupedPath = path.join(temp, 'grouped.json');
const e2ePath = path.join(temp, 'e2e.json');
const resultPath = path.join(temp, 'result.json');
const expectedCommands = uniqueCommands(['sms']);

function run() {
  return spawnSync(process.execPath, [
    path.join(root, 'scripts/verify-closure-evidence.cjs'),
    impactPath, groupedPath, e2ePath, resultPath,
  ], {
    cwd: root,
    env: { ...process.env, GITHUB_SHA: '', GITHUB_RUN_ID: '', GITHUB_RUN_ATTEMPT: '', WAWIS_PR_HEAD_SHA: '' },
    encoding: 'utf8',
  });
}
function writeGrouped(commands=expectedCommands) {
  fs.writeFileSync(groupedPath, JSON.stringify({
    schema_version:2,type:'grouped-checks',groups:['sms'],
    expected_commands:expectedCommands,
    commands:commands.map((command)=>({command,status:'passed'})),
    all_passed:true,
  },null,2));
}
function writeE2e(runs=[
  {platform:'mobile',script:'scripts/run-playwright-mobile.cjs',status:'passed'},
  {platform:'desktop',script:'scripts/run-playwright-desktop.cjs',status:'passed'},
]) {
  fs.writeFileSync(e2ePath, JSON.stringify({
    schema_version:2,type:'e2e',platforms:['mobile','desktop'],runs,all_passed:true,
  },null,2));
}

try {
  fs.writeFileSync(impactPath, JSON.stringify({
    profile:'critical',scope:'full',groups:['sms'],pr_groups:['sms'],needs_playwright:true,
    e2e:['mobile','desktop'],effective_files:['src/components/sms/SmsPanel.jsx'],
  },null,2));

  writeGrouped();
  writeE2e();
  let res=run();
  assert.equal(res.status,0,`valid evidence must pass:\n${res.stdout}\n${res.stderr}`);

  writeGrouped(['node -e "process.exit(0)"']);
  writeE2e();
  res=run();
  assert.notEqual(res.status,0,'fake one-command evidence must be rejected');
  assert.match(`${res.stdout}\n${res.stderr}`,/Niekompletny dowód komend/);

  writeGrouped();
  writeE2e([]);
  res=run();
  assert.notEqual(res.status,0,'empty E2E runs must be rejected');
  assert.match(`${res.stdout}\n${res.stderr}`,/złą liczbę przebiegów/);

  writeE2e([
    {platform:'mobile',script:'scripts/run-playwright-mobile.cjs',status:'passed'},
    {platform:'mobile',script:'scripts/run-playwright-mobile.cjs',status:'passed'},
  ]);
  res=run();
  assert.notEqual(res.status,0,'duplicate/missing E2E platform must be rejected');

  console.log('PASS: Closure Gate rejects incomplete command evidence and missing/duplicate E2E runs');
} finally {
  fs.rmSync(temp,{recursive:true,force:true});
}
