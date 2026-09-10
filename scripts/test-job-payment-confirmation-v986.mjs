import assert from 'node:assert/strict';
import {
  formatPaymentAmount,
  getPaymentDraftFromJob,
  getPaymentJobPatch,
  normalizePaymentConfirmation,
  saveJobPaymentConfirmation,
} from '../src/mobile791/modules/job-payment-confirmation.js';

const normalized = normalizePaymentConfirmation({
  enabled: true,
  amount: '4 200,50',
  kind: 'full',
  method: 'cash',
  paidDate: '2026-09-01',
});
assert.equal(normalized.amount, 4200.5);
assert.equal(normalized.kindLabel, 'Zapłacono całość');
assert.equal(normalized.methodLabel, 'Gotówka');
assert.match(formatPaymentAmount(normalized.amount), /4[\s\u00a0]?200,50/);

assert.throws(
  () => normalizePaymentConfirmation({ enabled: true, amount: '0', kind: 'full', method: 'cash', paidDate: '2026-09-01' }),
  /większą od zera/,
);

const disabledPatch = getPaymentJobPatch({ enabled: false }, null, new Date('2026-09-01T12:00:00.000Z'));
assert.equal(disabledPatch.payment_confirmation_enabled, false);
assert.equal(disabledPatch.payment_amount, null);

const draft = getPaymentDraftFromJob({
  payment_confirmation_enabled: true,
  payment_amount: 850,
  payment_kind: 'deposit',
  payment_method: 'transfer',
  payment_paid_at: '2026-09-01T10:00:00.000Z',
});
assert.equal(draft.enabled, true);
assert.equal(draft.amount, '850');
assert.equal(draft.kind, 'deposit');
assert.equal(draft.method, 'transfer');
assert.equal(draft.paidDate, '2026-09-01');

let capturedPatch = null;
let capturedId = null;
const supabase = {
  auth: {
    async getSession() {
      return { data: { session: { user: { id: 'worker-1' } } }, error: null };
    },
  },
  from(table) {
    assert.equal(table, 'jobs');
    return {
      update(patch) {
        capturedPatch = patch;
        return {
          async eq(field, value) {
            assert.equal(field, 'id');
            capturedId = value;
            return { data: null, error: null };
          },
        };
      },
    };
  },
};

const savedPatch = await saveJobPaymentConfirmation({
  supabase,
  job: { id: 'job-1' },
  payment: normalized,
});
assert.equal(capturedId, 'job-1');
assert.equal(capturedPatch.payment_amount, 4200.5);
assert.equal(capturedPatch.payment_recorded_by, 'worker-1');
assert.deepEqual(savedPatch, capturedPatch);

console.log('PASS test-job-payment-confirmation-v986');
