import fs from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createClient} from '@supabase/supabase-js';
export const ref='hlfvjbidopyraycwkbfg';
assert.ok(process.env.WAWIS_STAGING_CREDENTIALS,'Set WAWIS_STAGING_CREDENTIALS to a private branch credential file outside repository');
export const credentials=JSON.parse(fs.readFileSync(process.env.WAWIS_STAGING_CREDENTIALS,'utf8'));
export const url=`https://${ref}.supabase.co`;
assert.equal(credentials.SUPABASE_URL,url,'STAGING ONLY');
// Session pooler: transaction-mode 6543 cannot preserve per-session GUC/role.
const sessionUrl=new URL(credentials.POSTGRES_URL);sessionUrl.port='5432';
const connection=sessionUrl.toString();
assert.ok(connection.includes(ref),'Database URL must identify authorized staging');
export const admin=createClient(url,credentials.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
export function client(token){return createClient(url,credentials.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});}
export async function database(){const c=new pg.Client({connectionString:connection,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});await c.connect();return c;}
export function evidence(name,data){fs.writeFileSync(new URL(`../../docs/audits/v10.89/evidence/${name}.json`,import.meta.url),JSON.stringify({staging:ref,at:new Date().toISOString(),...data},null,2)+'\n');}
