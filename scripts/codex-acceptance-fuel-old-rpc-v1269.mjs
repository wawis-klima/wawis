import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/current/20261008160000_disable_legacy_fuel_rpc_v1269.sql', import.meta.url),
  'utf8',
);
const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create function public.admin_add_fuel_tank_movement(text,numeric,text) returns jsonb
    language sql as $$ select '{"old":true}'::jsonb $$;
  create function public.admin_add_fuel_tank_movement_v1266(text,numeric,text,uuid) returns jsonb
    language sql as $$ select '{"safe":true}'::jsonb $$;
  grant execute on function public.admin_add_fuel_tank_movement(text,numeric,text)
    to public,anon,authenticated,service_role;
  grant execute on function public.admin_add_fuel_tank_movement_v1266(text,numeric,text,uuid)
    to authenticated;
`);
await db.exec(migration);
for (const role of ['anon','authenticated','service_role']) {
  const old = await db.query('select has_function_privilege($1,$2,$3) as permitted',[
    role,'public.admin_add_fuel_tank_movement(text,numeric,text)','EXECUTE'
  ]);
  assert.equal(old.rows[0].permitted,false,role+' must not use legacy fuel delivery RPC');
}
await db.exec('set role authenticated');
await assert.rejects(
  () => db.query("select public.admin_add_fuel_tank_movement('delivery',100,'test')"),
  error => error?.code === '42501',
);
const safe = await db.query('select public.admin_add_fuel_tank_movement_v1266($1,$2,$3,$4) as result',[
  'delivery',100,'test','99999999-9999-4999-8999-999999999999'
]);
assert.equal(safe.rows[0].result.safe,true,'versioned idempotent RPC remains available');
await db.exec('reset role');
await db.close();
console.log('PASS CODEX P1-03: old non-idempotent fuel RPC denied, replacement allowed');
