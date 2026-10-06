import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('NO-GO: set SUPABASE_DB_URL or DATABASE_URL for native PostgreSQL concurrency verification.');
  process.exit(2);
}

const jobId = randomUUID();
const errorLogId = randomUUID();
const phone = '4860099' + String(Math.floor(Math.random() * 90000) + 10000);
const evidencePath = process.env.WAWIS_SQL_EVIDENCE_PATH || 'two-session-sql-evidence.json';
const evidence = {
  schema_version: 1,
  test: 'sms-two-session-postgres-v1258',
  job_id: jobId,
  error_log_id: errorLogId,
  normal_claim: null,
  retry_claim: null,
  cleanup: null,
};

const admin = new Client({ connectionString });
const a = new Client({ connectionString });
const b = new Client({ connectionString });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function beginService(client) {
  await client.query('begin');
  await client.query(`set local request.jwt.claim.role = 'service_role'`);
  await client.query(`set local request.jwt.claims = '{"role":"service_role"}'`);
}

async function pid(client) {
  return Number((await client.query('select pg_backend_pid() as pid')).rows[0].pid);
}

async function blockersFor(targetPid) {
  const row = (await admin.query(
    `select pg_blocking_pids($1::int) as blockers,state,wait_event_type,wait_event
     from pg_stat_activity where pid=$1::int`,
    [targetPid],
  )).rows[0];
  return row || { blockers: [] };
}

async function cleanup() {
  try { await a.query('rollback'); } catch {}
  try { await b.query('rollback'); } catch {}
  await admin.query('begin');
  try {
    await admin.query('set local session_replication_role = replica');
    await admin.query(
      `delete from private.sms_delivery_claims where job_id=$1::uuid or retry_of_log_id=$2::uuid or source_log_id=$2::uuid`,
      [jobId, errorLogId],
    );
    await admin.query('delete from public.sms_log where id=$1::uuid or job_id=$2::uuid', [errorLogId, jobId]);
    await admin.query('delete from public.jobs where id=$1::uuid', [jobId]);
    await admin.query('commit');
  } catch (error) {
    await admin.query('rollback');
    throw error;
  }
  const check = (await admin.query(
    `select
       (select count(*)::int from private.sms_delivery_claims where job_id=$1::uuid or retry_of_log_id=$2::uuid or source_log_id=$2::uuid) as claims_left,
       (select count(*)::int from public.sms_log where id=$2::uuid or job_id=$1::uuid) as logs_left,
       (select count(*)::int from public.jobs where id=$1::uuid) as jobs_left`,
    [jobId, errorLogId],
  )).rows[0];
  evidence.cleanup = check;
  assert.deepEqual(check, { claims_left: 0, logs_left: 0, jobs_left: 0 });
}

async function runRace({ label, claimSql, claimArgs, expectedLoser }) {
  await beginService(a);
  await beginService(b);
  const pidA = await pid(a);
  const pidB = await pid(b);
  assert.notEqual(pidA, pidB, `${label}: sessions must use different PostgreSQL backends`);

  const startedAt = new Date().toISOString();
  const winnerResult = await a.query(claimSql, claimArgs);
  const winnerValue = winnerResult.rows[0]?.result ?? winnerResult.rows[0]?.claim_id ?? null;
  assert.ok(winnerValue, `${label}: first session must obtain claim`);

  let loserSettled = false;
  const loserPromise = b.query(claimSql, claimArgs).then((result) => {
    loserSettled = true;
    return result;
  });

  await sleep(300);
  assert.equal(loserSettled, false, `${label}: second claim must still be waiting before first transaction commits`);
  const waiting = await blockersFor(pidB);
  const blockers = Array.isArray(waiting.blockers) ? waiting.blockers.map(Number) : [];
  assert.ok(blockers.includes(pidA), `${label}: pg_blocking_pids(${pidB}) must include winner PID ${pidA}; got ${JSON.stringify(waiting)}`);

  const beforeCommit = new Date().toISOString();
  await a.query('commit');
  const loserResult = await loserPromise;
  await b.query('commit');
  const endedAt = new Date().toISOString();

  const loserValue = loserResult.rows[0]?.result ?? loserResult.rows[0]?.claim_id ?? null;
  expectedLoser(loserValue);

  return {
    pid_a: pidA,
    pid_b: pidB,
    started_at: startedAt,
    blocked_before_winner_commit: true,
    blocking_pids: blockers,
    wait_event_type: waiting.wait_event_type || null,
    wait_event: waiting.wait_event || null,
    winner_value: winnerValue,
    loser_value: loserValue,
    winner_commit_started_at: beforeCommit,
    ended_at: endedAt,
  };
}

try {
  await Promise.all([admin.connect(), a.connect(), b.connect()]);
  await admin.query(
    `insert into public.jobs(
      id,title,client,phone,sms_recipient_phone,installation_date,
      sms_consent,sms_reminder_enabled,service_reminder_years
    ) values($1::uuid,'CLOSURE TWO SESSION','CLOSURE TWO SESSION',$2,$2,date '2025-10-06',true,true,5)`,
    [jobId, phone],
  );

  evidence.normal_claim = await runRace({
    label: 'normal_claim',
    claimSql: 'select public.claim_service_sms($1::uuid,null,1) as result',
    claimArgs: [jobId],
    expectedLoser: (value) => assert.equal(value, null, 'normal_claim: second session must receive NULL'),
  });

  await admin.query('delete from private.sms_delivery_claims where job_id=$1::uuid', [jobId]);

  await admin.query('begin');
  await admin.query(`set local request.jwt.claim.role = 'service_role'`);
  await admin.query(`set local request.jwt.claims = '{"role":"service_role"}'`);
  await admin.query(
    `insert into public.sms_log(
      id,job_id,client,phone,message,status,provider_message_id,sent_at,
      reminder_cycle,reminder_due_date,reminder_group_primary,error_message
    ) values($1::uuid,$2::uuid,'CLOSURE TWO SESSION',$3,'retry race fixture','error',
      'closure-two-session-provider-a',now()-interval '5 minutes',1,date '2026-09-06',true,'fixture failure')`,
    [errorLogId, jobId, phone],
  );
  await admin.query('commit');

  evidence.retry_claim = await runRace({
    label: 'retry_claim',
    claimSql: 'select public.claim_service_sms_not_sent_retry($1::uuid) as result',
    claimArgs: [errorLogId],
    expectedLoser: (value) => {
      assert.equal(value?.ok, false, 'retry_claim: second session must be rejected');
      assert.equal(value?.reason, 'retry_claim_exists', 'retry_claim: loser reason must be retry_claim_exists');
    },
  });

  const retryClaims = Number((await admin.query(
    'select count(*)::int as n from private.sms_delivery_claims where retry_of_log_id=$1::uuid',
    [errorLogId],
  )).rows[0].n);
  assert.equal(retryClaims, 1, 'retry_claim: exactly one retry claim must exist before cleanup');
  evidence.retry_claim.claims_before_cleanup = retryClaims;

  await cleanup();
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`PASS: native two-session PostgreSQL SMS claim/retry; evidence=${evidencePath}`);
} catch (error) {
  evidence.error = String(error?.stack || error);
  try { await cleanup(); } catch (cleanupError) {
    evidence.cleanup_error = String(cleanupError?.stack || cleanupError);
  }
  try { fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n'); } catch {}
  console.error('NO-GO:', error);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([a.end(), b.end(), admin.end()]);
}
