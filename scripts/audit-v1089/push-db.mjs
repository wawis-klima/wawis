import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const db=new PGlite();
try {
await db.exec(`create schema auth;create schema private;create role anon;create role authenticated;create role service_role;create function auth.uid() returns uuid language sql as $$select null::uuid$$;`);
await db.exec(read('supabase/rebuild/legacy_schema_bootstrap_v1089.sql').replace('create extension if not exists pgcrypto;',''));
await db.exec(read('supabase/migrations/20260916115000_push_lifecycle_history_v1083.sql'));
await db.exec(read('supabase/migrations/20260916184000_push_lifecycle_rpc_v1087.sql'));
await db.exec(read('supabase/migrations/20260917102820_audit_push_context.sql'));
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
async function sync(u,ep,token){await db.query(`select * from push_subscription_sync_atomic($1,$2,'key','auth',$3)`,[u,ep,token]);return (await db.query('select * from push_subscriptions where endpoint=$1',[ep])).rows[0];}
const a=await sync(A,'E1','A-life');
await db.query(`select * from push_subscription_disable_atomic($1,'E1','key','auth','A-life',false,false)`,[A]);
const b=await sync(B,'E2','B-life');
assert.equal(a.ownership_generation,1);assert.equal(b.ownership_generation,1);assert.ok(b.context_epoch>a.context_epoch);
const box={};vm.runInNewContext(read('public/push-context-guard.js'),box);const guard=box.WawisPushContextGuard;
const context=row=>({userId:row.user_id,generation:row.ownership_generation,endpoint:row.endpoint,contextEpoch:row.context_epoch,protocolVersion:3});
assert.equal(guard.shouldApplySet({...context(a),userId:'',terminalClear:true,clearedUserId:A},context(b)),true);
await db.query(`select * from push_subscription_expire_atomic($1,'E1','key','auth','A-life',1)`,[A]);
assert.equal((await db.query(`select is_active from push_subscriptions where endpoint='E2'`)).rows[0].is_active,true);
await db.query(`select * from push_subscription_disable_atomic($1,'E2','key','auth','B-life',false,false)`,[B]);
await assert.rejects(sync(A,'E1','A-life'),/push_lifecycle_disabled/);
console.log('A03 SQL real lifecycle: fresh epoch, endpoint generation1, stale410, tombstone PASS');
} catch(e){console.error(e.message);process.exitCode=1;} finally{await db.close();}

