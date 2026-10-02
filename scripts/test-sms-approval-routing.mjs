import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

for (const prefix of ['src', 'src/mobile791']) {
  const sms = await import(`../${prefix}/modules/sms.js`);
  const { buildUnsentSmsLogs } = await import(`../${prefix}/modules/sms-unsent.js`);
  const { sendUnsentSmsLog, approveAndSendSmsLogs } = await import(`../${prefix}/modules/sms-send.js`);
  const calls = [];
  let response = { ok: true, sentCount: 1 };
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'mock-token' } } }) },
    functions: { invoke: async (name, options) => {
      calls.push({ name, ...options.body });
      return { data: response };
    } },
  };
  const pending = { id: 'pending-primary', status: 'pending_approval', reminder_group_id: 'group-a', reminder_group_primary: true, phone: '48500600700', reminder_due_date: '2026-10-02' };
  const expired = { ...pending, id: 'expired', status: 'not_sent', reminder_group_id: 'group-b' };
  const secondary = { ...pending, id: 'pending-secondary', reminder_group_primary: false, created_at: '2026-10-02T17:00:00Z' };
  const linkedTarget = { id: 'device-a', queueLog: secondary, queueLogs: [secondary, pending] };
  const grouped = buildUnsentSmsLogs({ unsentLogs: [expired, expired], queue: [linkedTarget] });
  assert.equal(grouped.length, 2, 'Both types are visible once per group');
  assert.equal(grouped.find((log) => log.status === 'pending_approval').id, pending.id, 'Use the primary group log');
  assert.equal(grouped.find((log) => log.status === 'pending_approval').linkedTarget, linkedTarget);
  assert.equal(sms.getSmsStatusLabel(pending.status), 'Oczekuje na zatwierdzenie');

  await sendUnsentSmsLog({ supabase, log: pending });
  await sendUnsentSmsLog({ supabase, log: expired });
  assert.deepEqual(calls, [
    { name: 'send-service-sms', mode: 'approval', logIds: [pending.id] },
    { name: 'send-service-sms', mode: 'retry_not_sent', logIds: [expired.id] },
  ]);
  for (const status of ['sent', 'provider_sent', 'delivered', 'deleted', 'error', 'approved', 'sending', '']) {
    await assert.rejects(sendUnsentSmsLog({ supabase, log: { ...pending, status } }));
  }
  await assert.rejects(sendUnsentSmsLog({ supabase, log: { status: 'pending_approval' } }));
  assert.equal(calls.length, 2, 'Unsupported statuses must not invoke the sender');
  response = { ok: true, sentCount: 0 };
  await assert.rejects(sendUnsentSmsLog({ supabase, log: pending }), /Nie wysłano/);
  await assert.rejects(approveAndSendSmsLogs({ supabase, logIds: [pending.id] }), /Nie wysłano/);
  response = { ok: false, failures: [{ error: 'Wysyłka zablokowana' }] };
  await assert.rejects(sendUnsentSmsLog({ supabase, log: pending }), /Wysyłka zablokowana/);
  assert.equal(calls.length, 5, 'Failure must never fall back to another sending mode');

  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 11);
  const installationDate = date.toISOString().slice(0, 10);
  const targets = sms.buildSmsTargets({ jobs: [{ id: 'job-a', client: 'Klient testowy', phone: '500600700', sms_consent: true, sms_reminder_enabled: true, installation_date: installationDate }] });
  const queued = sms.deriveSmsQueue(targets, []);
  assert.equal(queued.length, 1);
  const historicalPending = { ...pending, job_id: 'job-a', reminder_cycle: queued[0].reminder_cycle, reminder_due_date: queued[0].reminder_due_date };
  const delivered = { ...historicalPending, id: 'delivered', status: 'delivered', delivered_at: new Date().toISOString() };
  const blockedQueue = sms.deriveSmsQueue(targets, [historicalPending, delivered]);
  assert.equal(buildUnsentSmsLogs({ queue: blockedQueue }).length, 0, 'Delivered groups must not return through stale pending logs');

  // Execute the real click handler twice before the response resolves.
  const panel = fs.readFileSync(new URL(`../${prefix}/components/sms/SmsPanel.jsx`, import.meta.url), 'utf8');
  const start = panel.indexOf('  async function handleRetryUnsentNow(row)');
  const end = panel.indexOf('  function toggleUnsentOne', start);
  assert.ok(start >= 0 && end > start);
  const messages = [];
  let resolveSend;
  let sends = 0;
  const context = {
    smsSendLockRef: { current: false }, supabase,
    setSendBusy: () => {}, setInfoMessage: (value) => messages.push(value), setErrorMessage: (value) => messages.push(value),
    reloadSmsData: async () => {}, refreshAll: async () => {},
    normalizeDatabaseErrorMessage: (error) => error.message,
    sendUnsentSmsLog: () => { sends += 1; return new Promise((resolve) => { resolveSend = resolve; }); },
  };
  vm.createContext(context);
  const handler = vm.runInContext(`${panel.slice(start, end)}; handleRetryUnsentNow`, context);
  const firstClick = handler({ ...pending, canSelect: true });
  await handler({ ...pending, canSelect: true });
  assert.equal(sends, 1, 'Double click sends only one request');
  resolveSend({ ok: true, sentCount: 1 });
  await firstClick;
  assert.equal(context.smsSendLockRef.current, false, 'Release the lock after completion');
  context.sendUnsentSmsLog = async () => { throw new Error('Nie wysłano żadnej wiadomości.'); };
  messages.length = 0;
  await handler({ ...pending, canSelect: true });
  assert.ok(messages.some((message) => message.includes('Nie wysłano')));
  assert.ok(!messages.some((message) => message.includes('został wysłany')));
  assert.equal(context.smsSendLockRef.current, false, 'Release the lock after failure');
}
console.log('SMS approval/retry routing, canonical grouping, zero-send and double-click regression OK');
