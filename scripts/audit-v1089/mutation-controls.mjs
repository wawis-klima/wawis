import fs from 'node:fs';import {spawnSync,execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import path from 'node:path';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));const base='ab3a3ad5eb2a3b346800307370f136e5d8b52c43';
const cases=[
 ['A01',null,['invariants.mjs','A01','--baseline'],'name-only must preserve'],
 ['A02',null,['invariants.mjs','A02','--baseline'],'Missing expected rejection'],
 ['A09',null,['invariants.mjs','A09','--baseline'],'job_nameplates_incomplete'],
 ['A03','public/push-context-guard.js',['push-context.mjs'],'fresh E2 generation 1'],
 ['A04 registry','src/mobile791/modules/job-protocol-email.js',['email-attempts.mjs'],'A/B/A must retain'],
 ['A04 TTL','supabase/functions/send-job-protocol-email/index.ts',['email-edge.mjs'],'25h retry must not send'],
 ['A05','supabase/functions/smsapi-delivery-webhook/index.ts',['sms-race.mjs'],'delayed SENT cannot regress'],
 ['A06','src/components/fuel/FuelPanelBase.jsx',['fuel-owner.mjs'],'B must not restore'],
 ['A11','src/components/devices/DevicesPanel.jsx',['loaders.mjs'],'devices FAIL'],
 ['A07',null,['rebuild-dependency.mjs','--baseline'],'archive_job_before_delete() does not exist'],
 ['A10','scripts/smoke-audit-fixes-v1086.mjs',['eol.mjs'],'CRLF source inputs must pass'],
];
for(const [label,file,args,expected] of cases){
 const destination=file?path.join(root,file):null;const saved=destination?fs.readFileSync(destination):null;
 try{
  if(destination)fs.writeFileSync(destination,execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/').replace(/\/$/,'')}`,'show',`${base}:${file}`],{cwd:root}));
  const result=spawnSync(process.execPath,[`scripts/audit-v1089/${args[0]}`,...args.slice(1)],{cwd:root,encoding:'utf8'});
  const output=(result.stdout||'')+(result.stderr||'');assert.notEqual(result.status,0,label+' mutation must fail');assert.ok(output.includes(expected),label+' failed for wrong reason: '+output);
  console.log(label,'CONTROL detected baseline fault, exit',result.status);
 }finally{if(destination)fs.writeFileSync(destination,saved);}
}
