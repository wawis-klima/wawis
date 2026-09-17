import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
for(const eol of ['LF','CRLF']){
const r=spawnSync(process.execPath,['--require','./scripts/audit-v1089/eol-input.cjs','scripts/smoke-audit-fixes-v1086.mjs'],{cwd:root,env:{...process.env,AUDIT_EOL:eol},encoding:'utf8'});
console.log(eol,'exit',r.status);if(r.status!==0)console.error(r.stderr);assert.equal(r.status,0,eol+' source inputs must pass same real smoke');
}
