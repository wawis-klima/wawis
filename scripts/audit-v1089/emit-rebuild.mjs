import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const ref=process.argv[2], output=process.argv[3];
if(ref!=='hlfvjbidopyraycwkbfg'||!output)throw new Error('Usage: node scripts/audit-v1089/emit-rebuild.mjs hlfvjbidopyraycwkbfg OUTPUT.sql; production forbidden');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'supabase/rebuild/manifest-v1089.json'),'utf8'));
const content=['\\set ON_ERROR_STOP on',`-- STAGING ONLY ${ref}; never execute against production.`,...manifest.files.map(file=>`\n-- SOURCE ${file}\n${fs.readFileSync(path.join(root,file),'utf8')}`),fs.readFileSync(path.join(root,'supabase/rebuild/verify_audit_v1089.sql'),'utf8')].join('\n');
fs.writeFileSync(output,content);console.log(`Prepared ${manifest.files.length} ordered repo SQL files for ${ref}; no database contacted.`);
