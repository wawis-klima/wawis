import assert from 'node:assert/strict';
import { getSmsStatusLabel } from '../src/modules/sms.js';
import { getQueueDeleteLogIds, getUnsentDeleteLogIds } from '../src/modules/sms-delete.js';

const deviceId = '11111111-1111-4111-8111-111111111111';
const queueLogId = '22222222-2222-4222-8222-222222222222';
const latestLogId = '33333333-3333-4333-8333-333333333333';
const groupedLogId = '44444444-4444-4444-8444-444444444444';

const queueRow = {
  id: deviceId,
  target_type: 'device',
  queueLog: { id: queueLogId },
  latestLog: { id: latestLogId },
  grouped_queue_log_ids: [groupedLogId, queueLogId],
};

const queueIds = getQueueDeleteLogIds(queueRow);
assert.equal(queueIds.includes(deviceId), false, 'ID urządzenia/zlecenia nie może trafić do listy sms_log do anulowania');
assert.deepEqual(
  new Set(queueIds),
  new Set([queueLogId, latestLogId, groupedLogId]),
  'kolejka ma przekazywać wyłącznie prawdziwe identyfikatory sms_log',
);

const unsentRowId = '55555555-5555-4555-8555-555555555555';
const unsentRetryId = '66666666-6666-4666-8666-666666666666';
const unsentIds = getUnsentDeleteLogIds({
  id: unsentRowId,
  retryLogId: unsentRetryId,
});

assert.deepEqual(
  unsentIds,
  [unsentRowId, unsentRetryId],
  'w widoku Niewysłane row.id nadal jest identyfikatorem sms_log i musi pozostać usuwalny',
);

assert.equal(
  getSmsStatusLabel('pending_approval'),
  'Oczekuje',
  'krótki status pending_approval powinien brzmieć „Oczekuje”',
);

console.log('PASS: SMS 12.59 delete identity + short pending label regressions');
