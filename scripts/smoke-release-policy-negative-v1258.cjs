const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'wawis-release-negative-v1258-'));
const gatePath=path.join(temp,'RELEASE-GATE.json');
const good=JSON.parse(fs.readFileSync(path.join(root,'RELEASE-GATE.json'),'utf8'));

function run(gate){
  fs.writeFileSync(gatePath,JSON.stringify(gate,null,2)+'\n');
  return spawnSync(process.execPath,['scripts/release-policy-gate.cjs'],{
    cwd:root,
    env:{...process.env,WAWIS_RELEASE_GATE_PATH:gatePath,WAWIS_PR_HEAD_REF:good.release_branch},
    encoding:'utf8',
  });
}

try {
  let res=run(good);
  assert.equal(res.status,0,`current EXTERNAL/REQUIRED gate must pass pre-release:\n${res.stdout}\n${res.stderr}`);

  res=run({...good,production_verification:{...good.production_verification,synthetic_test:'PENDING'}});
  assert.notEqual(res.status,0,'PENDING in production_verification must be NO-GO');
  assert.match(`${res.stdout}\n${res.stderr}`,/production_verification nie może zawierać PENDING/);

  res=run({...good,postdeploy_diagnostics:{...good.postdeploy_diagnostics,result:'WAITING'}});
  assert.notEqual(res.status,0,'WAITING postdeploy result must be NO-GO');
  assert.match(`${res.stdout}\n${res.stderr}`,/post-deploy status/);

  res=run({...good,production_verification:{...good.production_verification,synthetic_test:'REQUIRED'}});
  assert.equal(res.status,0,'REQUIRED is an allowed explicit pre-release state');

  console.log('PASS: release policy rejects PENDING/WAITING and accepts explicit EXTERNAL/REQUIRED states');
} finally {
  fs.rmSync(temp,{recursive:true,force:true});
}
