import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const scenarios=[['invariants','A01'],['invariants','A02'],['invariants','A09'],['roles'],['push-context'],['push-db'],['fuel-owner'],['fuel-tabs'],['fuel-retry'],['fuel-save-owner'],['loaders'],['email-attempts'],['email-edge'],['email-edge','--body-timeout'],['sms-race'],['rebuild-dependency'],['rebuild-rehearsal','--replay'],['eol']];
let failed=0;
for(const [name,...args] of scenarios){
 if(process.argv.includes('--control') && name==='invariants')args.push('--baseline');
 const r=spawnSync(process.execPath,[`scripts/audit-v1089/${name}.mjs`,...args],{cwd:root,stdio:'inherit'});
 if(r.status!==0){failed++;console.error('FAILED',name,...args,'exit',r.status);}
}
console.log(`Audit executable gate: ${scenarios.length-failed}/${scenarios.length} local scenarios passed. Staging/browser evidence is separate.`);
process.exitCode=failed?1:0;
