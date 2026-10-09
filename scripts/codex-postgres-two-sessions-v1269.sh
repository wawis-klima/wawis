#!/usr/bin/env bash
# WAWIS 12.69 Codex: two genuinely separate PostgreSQL backend sessions.
# Run ONLY on ephemeral CI PostgreSQL, never on production or a customer database.
set -euo pipefail
# CI-only, isolated fixture: no production URLs, no mounted volumes, no port exposure.
if [[ "$GITHUB_ACTIONS" != "true" ]]; then
  echo "NO-GO: only use a disposable GitHub Actions runner" >&2
  exit 12
fi
command -v docker >/dev/null || { echo "NO-GO: Docker required"; exit 13; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
secret="$(openssl rand -hex 18)"
container="$(docker run --rm -d \
  --env POSTGRES_USER=postgres \
  --env POSTGRES_DB=wawis_codex_ci \
  --env POSTGRES_PASSWORD="$secret" \
  postgres:16)"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
ready=false
for attempt in $(seq 1 40); do
  # pg_isready can report a listening server before the requested database exists.
  # Verify an actual query against the named disposable database before running fixtures.
  if docker exec "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d wawis_codex_ci -c 'select 1' 2>/dev/null | grep -qx '1'; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != "true" ]]; then
  echo "NO-GO: disposable PostgreSQL fixture failed to start" >&2
  exit 14
fi
pg() { docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -At -U postgres -d wawis_codex_ci "$@"; }
pg <<'SQL'
create schema auth;
create schema private;
create role anon;
create role authenticated;
create role service_role;
grant usage on schema auth to authenticated,service_role;
grant usage on schema public to authenticated,service_role;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create function auth.role() returns text language sql stable as $$
 select nullif(current_setting('request.jwt.claim.role',true),'')
$$;
create function public.current_user_is_admin() returns boolean language sql stable as $$
 select auth.uid() = '22222222-2222-4222-8222-222222222222'::uuid
$$;
create table public.jobs (
 id uuid primary key, admin_note text, status text,
 main_technician_id uuid, installer_ids uuid[],
 push_assignment_epoch bigint, device_model text
);
create table public.profiles(id uuid primary key,role text);
create table public.job_access(job_id uuid,user_id uuid);
create table public.fuel_tank_movements (
 id uuid primary key default gen_random_uuid(),
 movement_type text not null,delta_liters numeric(12,2) not null,
 fuel_entry_id uuid,note text,happened_at timestamptz default now(),
 created_by uuid,created_at timestamptz default now()
);
create table public.push_subscriptions (
 id uuid primary key, user_id uuid not null,
 is_active boolean not null default true
);
grant select,insert,update on public.jobs to authenticated,service_role;
grant select on public.profiles to authenticated;
grant select,insert on public.job_access to authenticated;
grant select,insert on public.fuel_tank_movements to authenticated;
grant select on public.push_subscriptions to service_role;
insert into public.jobs(id,admin_note,status) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','old','W trakcie');
insert into public.push_subscriptions(id,user_id,is_active) values
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SQL
pg < "$ROOT/supabase/migrations/20260928120000_job_installers_concurrency_v1168.sql"
pg < "$ROOT/supabase/migrations/current/20261008103135_fuel_tank_idempotency_v1266.sql"
pg < "$ROOT/supabase/migrations/current/20261008113943_push_recipient_dedup_v1268.sql"
# A/B: stale note B queues behind A's row lock; after A commits, B must fail with JOB_EDIT_CONFLICT.
pg >"$WORK/note-a.out" 2>"$WORK/note-a.err" <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select 'pid='||pg_backend_pid();
select public.save_job_concurrent_v1168(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '{"admin_note":"A"}'::jsonb,'{"admin_note":"old"}'::jsonb,
 null,null,false);
select pg_sleep(1);
commit;
SQL
a=$!
sleep 0.15
set +e
pg >"$WORK/note-b.out" 2>"$WORK/note-b.err" <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select 'pid='||pg_backend_pid();
select public.save_job_concurrent_v1168(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '{"admin_note":"B"}'::jsonb,'{"admin_note":"old"}'::jsonb,
 null,null,false);
commit;
SQL
b=$!
wait "$a"; ra=$?
wait "$b"; rb=$?
set -e
[[ "$ra" -eq 0 && "$rb" -ne 0 ]] || { echo "NO-GO: note A/B exit statuses $ra/$rb"; cat "$WORK/note-a.err" "$WORK/note-b.err"; exit 2; }
grep -q 'JOB_EDIT_CONFLICT:admin_note' "$WORK/note-b.err" || { cat "$WORK/note-b.err"; exit 3; }
[[ "$(pg -c "select admin_note from public.jobs where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'")" == 'A' ]] || exit 4
echo "PASS CODEX P1-02 two distinct PostgreSQL sessions: one note update; B conflicts; stored A"

# A/B: actual production idempotent function; second connection waits on the index then returns same row.
pg >"$WORK/fuel-a.out" 2>"$WORK/fuel-a.err" <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select 'pid='||pg_backend_pid();
select (public.admin_add_fuel_tank_movement_v1266(
 'delivery',100,'codex-fixture','99999999-9999-4999-8999-999999999999'::uuid)->>'id');
select pg_sleep(1);
commit;
SQL
a=$!
sleep 0.15
pg >"$WORK/fuel-b.out" 2>"$WORK/fuel-b.err" <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select 'pid='||pg_backend_pid();
select (public.admin_add_fuel_tank_movement_v1266(
 'delivery',100,'codex-fixture','99999999-9999-4999-8999-999999999999'::uuid)->>'id');
commit;
SQL
b=$!
wait "$a" || { cat "$WORK/fuel-a.err"; exit 5; }
wait "$b" || { cat "$WORK/fuel-b.err"; exit 6; }
ida="$(grep -E '^[a-f0-9]{8}-[a-f0-9-]{27,}$' "$WORK/fuel-a.out" | tail -1)"
idb="$(grep -E '^[a-f0-9]{8}-[a-f0-9-]{27,}$' "$WORK/fuel-b.out" | tail -1)"
[[ -n "$ida" && "$ida" == "$idb" ]] || { echo "NO-GO: duplicated fuel entry ids"; cat "$WORK/fuel-a.out" "$WORK/fuel-b.out"; exit 7; }
[[ "$(pg -c "select count(*)::text||':'||sum(delta_liters)::text from public.fuel_tank_movements")" == '1:100.00' ]] || exit 8
echo "PASS CODEX P1-03 two distinct PostgreSQL sessions: same ID, exactly 1 delivery of 100 L"

# Two concurrent calls for one endpoint/event; one claim wins, second must be false.
pg >"$WORK/push-a.out" 2>"$WORK/push-a.err" <<'SQL' &
begin;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select 'pid='||pg_backend_pid();
select 'claim='||public.push_claim_delivery_v1268(
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','job_assigned:ci:1');
select pg_sleep(1);
commit;
SQL
a=$!
sleep 0.15
pg >"$WORK/push-b.out" 2>"$WORK/push-b.err" <<'SQL' &
begin;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select 'pid='||pg_backend_pid();
select 'claim='||public.push_claim_delivery_v1268(
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','job_assigned:ci:1');
commit;
SQL
b=$!
wait "$a" || { cat "$WORK/push-a.err"; exit 9; }
wait "$b" || { cat "$WORK/push-b.err"; exit 10; }
grep -q '^claim=true$' "$WORK/push-a.out" || { cat "$WORK/push-a.out"; exit 11; }
grep -q '^claim=false$' "$WORK/push-b.out" || { cat "$WORK/push-b.out"; exit 12; }
[[ "$(pg -c "select count(*) from private.push_dispatch_claims_v1268")" == '1' ]] || exit 13
# An independent endpoint for same event may be claimed once.
pg -c "set role service_role; select set_config('request.jwt.claim.role','service_role',false); select public.push_claim_delivery_v1268('dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','job_assigned:ci:1');" >"$WORK/push-second.out"
[[ "$(pg -c "select count(*) from private.push_dispatch_claims_v1268")" == '2' ]] || exit 14
echo "PASS CODEX P1-06 two distinct PostgreSQL sessions: 1 winner, 1 duplicate rejected, independent subscription allowed"

# Verify A/B were different database backend sessions rather than one local emulation.
for p in note fuel push; do
  first="$(grep -E '^pid=[0-9]+$' "$WORK/$p-a.out" | head -1)"
  second="$(grep -E '^pid=[0-9]+$' "$WORK/$p-b.out" | head -1)"
  [[ -n "$first" && -n "$second" && "$first" != "$second" ]] || { echo "NO-GO: non-independent sessions: $p $first/$second"; exit 15; }
  echo "SESSION EVIDENCE $p: $first / $second"
done
echo "PASS all Codex dual-session races — disposable real PostgreSQL"
