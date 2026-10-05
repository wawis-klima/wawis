import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { collectSmsCallbackAuthTokens } from '../supabase/functions/smsapi-delivery-webhook/security.mjs';

const baseMigration = fs.readFileSync(
  new URL('../supabase/migrations/20261005133000_sms_callback_auth_rotation_v1246.sql', import.meta.url),
  'utf8',
);
const n02Migration = fs.readFileSync(
  new URL('../supabase/migrations/20261005154104_sms_callback_multi_generation_grace_v1251.sql', import.meta.url),
  'utf8',
);

function tokenSet(payload) {
  return new Set(collectSmsCallbackAuthTokens(payload));
}

async function createDb() {
  const db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role;" +
    "create schema auth; create schema private; create schema extensions;" +
    "create sequence extensions.token_seq;" +
    "create function auth.jwt() returns jsonb language sql stable set search_path to '' as $$select '{\"role\":\"service_role\"}'::jsonb$$;" +
    "create function extensions.gen_random_bytes(p_len integer) returns bytea language plpgsql volatile set search_path to '' as $$ declare v text; begin v:=nextval('extensions.token_seq')::text; return decode(substr(md5(v)||md5(v||':2'),1,p_len*2),'hex'); end $$;"
  );
  await db.exec(baseMigration);
  return db;
}

{
  const db = await createDb();
  await db.exec(n02Migration);

  const first = (await db.query(
    'select public.get_smsapi_callback_auth_tokens() as x'
  )).rows[0].x;
  const t0 = first.current;
  assert.equal(first.previous, null);
  assert.deepEqual([...tokenSet(first)], [t0]);

  const rotation1 = (await db.query(
    'select public.rotate_smsapi_callback_auth_token(60) as x'
  )).rows[0].x;
  assert.equal(rotation1.ok, true);
  assert.equal(rotation1.valid_previous_generations, 1);

  const after1 = (await db.query(
    'select public.get_smsapi_callback_auth_tokens() as x'
  )).rows[0].x;
  const t1 = after1.current;
  assert.equal(after1.previous, t0);
  assert.deepEqual(tokenSet(after1), new Set([t0, t1]));

  const t0Expiry = (await db.query(
    'select valid_until::text as x from private.sms_callback_auth_token_history where token=$1',
    [t0],
  )).rows[0].x;

  const rotation2 = (await db.query(
    'select public.rotate_smsapi_callback_auth_token(120) as x'
  )).rows[0].x;
  assert.equal(rotation2.ok, true);
  assert.equal(rotation2.valid_previous_generations, 2);

  const after2 = (await db.query(
    'select public.get_smsapi_callback_auth_tokens() as x'
  )).rows[0].x;
  const t2 = after2.current;
  assert.equal(after2.previous, t1);
  assert.deepEqual(tokenSet(after2), new Set([t0, t1, t2]));

  const t0ExpiryAfterSecondRotation = (await db.query(
    'select valid_until::text as x from private.sms_callback_auth_token_history where token=$1',
    [t0],
  )).rows[0].x;
  assert.equal(
    t0ExpiryAfterSecondRotation,
    t0Expiry,
    'Druga rotacja nie może skrócić ani przesunąć wcześniej przyznanego grace T0.',
  );

  const rotation3 = (await db.query(
    'select public.rotate_smsapi_callback_auth_token(180) as x'
  )).rows[0].x;
  assert.equal(rotation3.ok, true);
  assert.equal(rotation3.valid_previous_generations, 3);

  const after3 = (await db.query(
    'select public.get_smsapi_callback_auth_tokens() as x'
  )).rows[0].x;
  const t3 = after3.current;
  assert.equal(after3.previous, t2);
  assert.deepEqual(tokenSet(after3), new Set([t0, t1, t2, t3]));

  await db.query(
    "update private.sms_callback_auth_token_history set valid_until=now()-interval '1 second' where token=$1",
    [t0],
  );

  const afterExpiry = (await db.query(
    'select public.get_smsapi_callback_auth_tokens() as x'
  )).rows[0].x;
  assert.equal(tokenSet(afterExpiry).has(t0), false);
  assert.deepEqual(tokenSet(afterExpiry), new Set([t1, t2, t3]));

  await db.close();
}

{
  const db = await createDb();
  const legacy = 'a'.repeat(64);
  await db.query(
    "update private.sms_callback_auth_config set previous_token=$1, previous_valid_until=now()+interval '60 minutes'",
    [legacy],
  );
  await db.exec(n02Migration);

  const tokens = (await db.query(
    'select public.get_smsapi_callback_auth_tokens() as x'
  )).rows[0].x;
  assert.equal(tokenSet(tokens).has(legacy), true, 'Ważny legacy previous musi zostać zmigrowany do historii.');

  await db.close();
}

assert.match(n02Migration, /sms_callback_auth_token_history/);
assert.match(n02Migration, /valid_tokens/);
assert.match(n02Migration, /for update/i);
assert.match(n02Migration, /delete from private\.sms_callback_auth_token_history/i);
assert.match(n02Migration, /revoke all on table private\.sms_callback_auth_token_history from public, anon, authenticated/i);

console.log('PASS: SMS N-02 preserves callback grace across three consecutive rotations');
