// WAWIS 14.49 — jedno źródło prawdy dla roli administratora (audyt 20.11.2026).
// RED na 14.48: profiles.role przyjmuje dowolny tekst. Konto z rolą 'admin' jest administratorem dla
// current_user_is_admin() (RLS, większość RPC), ale NIE dla admin_delete_comment, funkcji Edge
// purge-service-visit / send-service-visit-protocol-email i interfejsu (porównanie z 'Administrator').
// GREEN: rola może mieć tylko wartość Administrator / Pracownik / Oczekujący, a admin_delete_comment
// korzysta z current_user_is_admin() — oba sposoby sprawdzania dają ten sam wynik.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261120180000_profiles_role_values_admin_check_v1449.sql', import.meta.url), 'utf8');
const baseline = fs.readFileSync(new URL('../supabase/rebuild/20260917045604_n7_v1089_admin_core_baseline.sql', import.meta.url), 'utf8');
const oldDeleteComment = baseline.match(/CREATE OR REPLACE FUNCTION public\.admin_delete_comment[\s\S]*?\$function\$;/)[0];

const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WORKER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PENDING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ALIAS = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

async function freshDb() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create role authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, full_name text, email text unique, role text default 'Oczekujący'::text not null, created_at timestamptz default now());
    create table public.comments (id uuid primary key default gen_random_uuid(), job_id uuid, author_id uuid, content text);
    -- Produkcyjna definicja (20.11.2026): bez rozróżniania wielkości liter, z aliasem 'admin'.
    create or replace function public.current_user_is_admin() returns boolean language sql stable security definer set search_path to 'public' as $f$
      select coalesce(exists (select 1 from public.profiles p where p.id = auth.uid() and lower(trim(coalesce(p.role, ''))) in ('administrator', 'admin')), false);
    $f$;
    grant usage on schema public to authenticated;
    grant execute on function public.current_user_is_admin() to authenticated;
  `);
  await db.exec(oldDeleteComment);
  await db.exec('grant execute on function public.admin_delete_comment(uuid) to authenticated;');
  return db;
}

async function as(db, uid, sql, params = []) {
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

async function addComment(db) {
  const { rows } = await db.query("insert into public.comments(content) values ('test') returning id");
  return rows[0].id;
}

// ---- RED: stan 14.48 ----
{
  const db = await freshDb();
  await db.query("insert into public.profiles(id, role) values ($1, 'admin')", [ALIAS]);
  const isAdmin = await as(db, ALIAS, 'select public.current_user_is_admin() as ok');
  assert.equal(isAdmin.rows[0].ok, true, 'RED: alias admin jest administratorem dla current_user_is_admin()');
  const commentId = await addComment(db);
  await assert.rejects(
    () => as(db, ALIAS, 'select public.admin_delete_comment($1) as ok', [commentId]),
    /Brak uprawnień administratora/,
    'RED: ten sam użytkownik nie może usunąć komentarza — dwa różne sprawdzenia roli',
  );
  await db.close();
}

// ---- GREEN: po migracji 14.49 ----
{
  const db = await freshDb();
  await db.query("insert into public.profiles(id, role) values ($1, 'Administrator'), ($2, 'Pracownik'), ($3, 'Oczekujący')", [ADMIN, WORKER, PENDING]);
  await db.exec(migration);
  await db.exec(migration); // ponowne uruchomienie jest bezpieczne

  // Spoza listy nie da się zapisać — ani przy dodaniu, ani przy zmianie roli.
  for (const bad of ['admin', 'administrator', 'Admin', 'ADMINISTRATOR', 'employee', 'pracownik', '', ' Administrator']) {
    await assert.rejects(
      () => db.query('insert into public.profiles(id, role) values ($1, $2)', [ALIAS, bad]),
      (error) => error.code === '23514',
      `rola ${JSON.stringify(bad)} odrzucona`,
    );
  }
  await assert.rejects(() => db.query("update public.profiles set role = 'admin' where id = $1", [ADMIN]), (e) => e.code === '23514');
  await db.query("update public.profiles set role = 'Pracownik' where id = $1", [PENDING]);
  await db.query("update public.profiles set role = 'Oczekujący' where id = $1", [PENDING]);
  const defaultRole = await db.query("insert into public.profiles(id) values ($1) returning role", [ALIAS]);
  assert.equal(defaultRole.rows[0].role, 'Oczekujący', 'nowe konto (handle_new_user / domyślna) nadal przechodzi');

  // admin_delete_comment: wynik zgodny z current_user_is_admin() dla każdego użytkownika.
  for (const [uid, expected] of [[ADMIN, true], [WORKER, false], [PENDING, false], [ALIAS, false]]) {
    const check = await as(db, uid, 'select public.current_user_is_admin() as ok');
    assert.equal(check.rows[0].ok, expected, `current_user_is_admin dla ${uid}`);
    const commentId = await addComment(db);
    if (expected) {
      const result = await as(db, uid, 'select public.admin_delete_comment($1) as ok', [commentId]);
      assert.equal(result.rows[0].ok, true, 'administrator usuwa komentarz');
      const left = await db.query('select count(*)::int as n from public.comments where id = $1', [commentId]);
      assert.equal(left.rows[0].n, 0, 'komentarz faktycznie usunięty');
    } else {
      await assert.rejects(() => as(db, uid, 'select public.admin_delete_comment($1)', [commentId]), /Brak uprawnień administratora/);
      const left = await db.query('select count(*)::int as n from public.comments where id = $1', [commentId]);
      assert.equal(left.rows[0].n, 1, 'komentarz zostaje');
    }
  }
  const missing = await as(db, ADMIN, "select public.admin_delete_comment('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') as ok");
  assert.equal(missing.rows[0].ok, false, 'brak komentarza → false, bez błędu');
  const fn = await db.query("select prosecdef, proconfig from pg_proc where proname = 'admin_delete_comment'");
  assert.equal(fn.rows[0].prosecdef, true, 'nadal SECURITY DEFINER');
  assert.deepEqual(fn.rows[0].proconfig, ['search_path=public'], 'stały search_path');
  await db.close();
}

// ---- Migracja zatrzymuje się, zamiast łamać konta z nietypową rolą ----
{
  const db = await freshDb();
  await db.query("insert into public.profiles(id, role) values ($1, 'admin')", [ALIAS]);
  await assert.rejects(() => db.exec(migration), /wartość spoza listy/);
  const still = await db.query('select role from public.profiles where id = $1', [ALIAS]);
  assert.equal(still.rows[0].role, 'admin', 'nic nie zmieniono — właściciel decyduje');
  await db.close();
}

// Po migracji dokładne porównania z 'Administrator' (Edge, interfejs) są równoważne current_user_is_admin().
const exactChecks = [
  'supabase/functions/purge-service-visit/index.ts',
  'supabase/functions/send-service-visit-protocol-email/index.ts',
  'src/App.jsx',
  'src/mobile791/App.jsx',
];
for (const file of exactChecks) {
  assert.match(fs.readFileSync(file, 'utf8'), /["']Administrator["']/, `${file}: porównanie z 'Administrator'`);
}
assert.match(migration, /check \(role in \('Administrator', 'Pracownik', 'Oczekujący'\)\)/);
const guard = fs.readFileSync('supabase/rebuild/legacy_schema_bootstrap_v1089.sql', 'utf8');
assert.match(guard, /role text default 'Oczekujący'::text not null/, 'domyślna rola mieści się w liście');

console.log('PASS WAWIS 14.49 — rola: tylko Administrator/Pracownik/Oczekujący; admin_delete_comment przez current_user_is_admin(); RED na 14.48 (alias admin), migracja bezpieczna przy ponownym uruchomieniu.');
