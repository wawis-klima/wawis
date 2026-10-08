import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { saveJobAdminNote as saveDesktopNote } from '../src/modules/jobs-crud.js';
import { saveJobAdminNote as saveMobileNote } from '../src/mobile791/modules/jobs-crud.js';
import { addFuelTankDelivery } from '../src/modules/fuel.js';

const jobId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
for (const save of [saveDesktopNote, saveMobileNote]) {
  let note = 'original';
  const supabase = {
    async rpc(name, values) {
      assert.equal(name, 'save_job_concurrent_v1168');
      assert.equal(values.p_id, jobId);
      assert.deepEqual(values.p_expected, { admin_note: 'original' });
      if (note !== values.p_expected.admin_note) {
        return { data: null, error: { message: 'JOB_EDIT_CONFLICT:admin_note' } };
      }
      note = values.p_fields.admin_note;
      return { data: { id: jobId, admin_note: note }, error: null };
    },
  };
  await save({ supabase, jobId, adminNote: 'A', expectedAdminNote: 'original' });
  await assert.rejects(
    () => save({ supabase, jobId, adminNote: 'B', expectedAdminNote: 'original' }),
    /JOB_EDIT_CONFLICT/,
  );
  assert.equal(note, 'A', 'stale editor must not silently overwrite notes');
}

const migration = fs.readFileSync(
  new URL('../supabase/migrations/current/20261008121500_fuel_tank_idempotency_v1266.sql', import.meta.url),
  'utf8',
);
const db = new PGlite();
await db.exec(`
  create schema auth;
  create role authenticated;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  create or replace function public.current_user_is_admin() returns boolean language sql stable as $$
    select auth.uid() = '22222222-2222-4222-8222-222222222222'::uuid
  $$;
  create table public.fuel_tank_movements (
    id uuid primary key default gen_random_uuid(),
    movement_type text not null,
    delta_liters numeric(12,2) not null,
    fuel_entry_id uuid,
    note text,
    happened_at timestamptz not null default now(),
    created_by uuid,
    created_at timestamptz not null default now()
  );
  alter table public.fuel_tank_movements enable row level security;
  grant select,insert on public.fuel_tank_movements to authenticated;
  create policy admin_select on public.fuel_tank_movements
    for select to authenticated using (public.current_user_is_admin());
  create policy admin_insert on public.fuel_tank_movements
    for insert to authenticated with check (
      public.current_user_is_admin() and created_by = auth.uid()
    );
`);
await db.exec(migration);
await db.exec('set role authenticated');
await db.query("select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false)");
const op = '99999999-9999-4999-8999-999999999999';
const execDelivery = (liters = 100, note = 'tankowanie') => db.query(
  'select public.admin_add_fuel_tank_movement_v1266($1,$2,$3,$4) as row',
  ['delivery', liters, note, op],
);
const first = await execDelivery();
const second = await execDelivery();
assert.equal(first.rows[0].row.id, second.rows[0].row.id);
const total = await db.query('select count(*)::int as c,sum(delta_liters)::numeric as total from public.fuel_tank_movements');
assert.equal(total.rows[0].c, 1, 'lost-response retry must not add another row');
assert.equal(Number(total.rows[0].total), 100, 'lost-response retry must not double the balance');
await assert.rejects(() => execDelivery(200), (error) => error?.code === '23505');
await db.query("select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false)");
await assert.rejects(
  () => db.query('select public.admin_add_fuel_tank_movement_v1266($1,$2,$3,$4)', ['delivery', 50, null, '88888888-8888-4888-8888-888888888888']),
  (error) => error?.code === '42501',
);

const calls = [];
await addFuelTankDelivery({
  supabase: { async rpc(name, args) { calls.push({ name, args }); return { data: first.rows[0].row, error: null }; } },
  isAdmin: true, liters: 100, note: 'tankowanie', operationId: op,
});
assert.equal(calls[0].name, 'admin_add_fuel_tank_movement_v1266');
assert.equal(calls[0].args.p_operation_id, op);

const edge = fs.readFileSync(new URL('../supabase/functions/fakturownia-client/index.ts',import.meta.url),'utf8');
assert.match(edge, /matchingExternal\.length > 1/);
assert.match(edge, /Kartoteka o podanym NIP jest powiązana z innym kontrahentem/);
assert.match(edge, /Kartoteka z tym adresem e-mail|kartoteka z tym adresem e-mail/i);
assert.match(edge, /Nieprawidłowa odpowiedź listy klientów/);
console.log('PASS v12.66 package 1 notes / idempotent fuel SQL and client / Fakturownia safeguards');
