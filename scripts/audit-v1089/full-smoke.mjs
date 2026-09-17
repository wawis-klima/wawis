import {createRequire} from 'node:module';import {spawnSync} from 'node:child_process';import fs from 'node:fs';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);const {getReleaseGroups,uniqueCommands}=require('../test-groups.cjs');
const root=fileURLToPath(new URL('../../',import.meta.url));const results=[];
for(const command of uniqueCommands(getReleaseGroups('full'))){
 const r=spawnSync(command,{cwd:root,shell:true,encoding:'utf8',env:process.env});
 results.push({command,status:r.status,error:r.error?.message});
 console.log(`\nCOMMAND ${command}\nEXIT ${r.status}\n${r.stdout||''}${r.stderr||''}`);
}
fs.writeFileSync(new URL('../../docs/audits/v10.89/evidence/full-smoke-results.json',import.meta.url),JSON.stringify(results,null,2));
console.log('SUMMARY',results.filter(r=>r.status===0).length,'/',results.length);process.exitCode=results.some(r=>r.status!==0)?1:0;
