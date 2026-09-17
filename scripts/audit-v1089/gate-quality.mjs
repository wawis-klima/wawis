import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));const base='ab3a3ad5eb2a3b346800307370f136e5d8b52c43';
const guard=new URL('../../public/push-context-guard.js',import.meta.url),gate=new URL('../../scripts/smoke-audit-fixes-v1088.mjs',import.meta.url);
const savedGuard=fs.readFileSync(guard),savedGate=fs.readFileSync(gate);
const historical=p=>execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/').replace(/\/$/,'')}`,'show',`${base}:${p}`],{cwd:root});
const run=()=>spawnSync(process.execPath,['scripts/smoke-audit-fixes-v1088.mjs'],{cwd:root,encoding:'utf8'});
try{
 fs.writeFileSync(guard,historical('public/push-context-guard.js'));fs.writeFileSync(gate,historical('scripts/smoke-audit-fixes-v1088.mjs'));
 const before=run();assert.equal(before.status,0,'Historical false-green gate must reproduce its acceptance: '+before.stderr);
 fs.writeFileSync(gate,savedGate);const after=run();assert.notEqual(after.status,0,'Executable gate must reject same injected runtime fault');assert.match(after.stdout+after.stderr,/fresh E2 generation 1/);
 const result={finding:'A08',fault:'baseline PUSH E1 CLEAR E2 generation1',baselineGateExit:before.status,baselineResult:'RED quality: accepted known runtime regression',currentGateExit:after.status,currentResult:'GREEN quality: rejected same behavioral regression',sourceRestored:true};
 fs.writeFileSync(new URL('../../docs/audits/v10.89/evidence/gate-quality.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{fs.writeFileSync(guard,savedGuard);fs.writeFileSync(gate,savedGate);}
