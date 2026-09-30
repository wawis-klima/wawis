import assert from 'node:assert/strict';
import {
  formatPaymentAmount,
  getPaymentDraftFromJob,
  getPaymentJobPatch,
  hasJobPaymentSnapshot,
  isPaymentConfirmationUnchanged,
  loadJobPaymentSnapshot,
  PAYMENT_JOB_FIELDS,
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
  /gotówką.*większą od zera/i,
);

const transferWithoutAmount = normalizePaymentConfirmation({
  enabled: true,
  amount: '0',
  kind: 'full',
  method: 'transfer',
  paidDate: '2026-09-01',
});
assert.equal(transferWithoutAmount.amount, null);
assert.equal(transferWithoutAmount.amountLabel, '-');

const transferBlankAmount = normalizePaymentConfirmation({
  enabled: true,
  amount: '',
  kind: 'full',
  method: 'transfer',
  paidDate: '2026-09-01',
});
assert.equal(transferBlankAmount.amount, null);

assert.throws(
  () => normalizePaymentConfirmation({ enabled: true, amount: '100', kind: 'full', method: 'card', paidDate: '2026-09-01' }),
  /Wybierz sposób płatności/,
);
assert.throws(
  () => normalizePaymentConfirmation({ enabled: true, amount: '100', kind: 'full', method: 'blik', paidDate: '2026-09-01' }),
  /Wybierz sposób płatności/,
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

const completePaymentSnapshot = {
  payment_confirmation_enabled: true,
  payment_amount: 850,
  payment_kind: 'deposit',
  payment_method: 'transfer',
  payment_paid_at: '2026-09-01T10:00:00.000Z',
  payment_recorded_by: 'worker-1',
  payment_updated_at: '2026-09-01T10:01:00.000Z',
};
assert.equal(hasJobPaymentSnapshot(completePaymentSnapshot), true);
assert.equal(hasJobPaymentSnapshot({ payment_confirmation_enabled: true, payment_amount: 850 }), false);

let paymentSelectFields = '';
let paymentSelectJobId = '';
const paymentReadSupabase = {
  from(table) {
    assert.equal(table, 'jobs');
    return {
      select(fields) {
        paymentSelectFields = fields;
        return {
          eq(field, value) {
            assert.equal(field, 'id');
            paymentSelectJobId = value;
            return {
              async maybeSingle() {
                return { data: completePaymentSnapshot, error: null };
              },
            };
          },
        };
      },
    };
  },
};
const loadedSnapshot = await loadJobPaymentSnapshot({
  supabase: paymentReadSupabase,
  jobId: 'job-payment-read',
});
assert.equal(paymentSelectFields, PAYMENT_JOB_FIELDS);
assert.equal(paymentSelectJobId, 'job-payment-read');
assert.deepEqual(loadedSnapshot, completePaymentSnapshot);

const failedPaymentReadSupabase = {
  from() {
    return {
      select() {
        return {
          eq() {
            return {
              async maybeSingle() {
                return { data: null, error: new Error('network unavailable') };
              },
            };
          },
        };
      },
    };
  },
};
await assert.rejects(
  () => loadJobPaymentSnapshot({ supabase: failedPaymentReadSupabase, jobId: 'job-old-cache' }),
  /network unavailable/,
  'Stary cache bez payment_* nie może zostać potraktowany jak brak płatności, gdy doładowanie nie powiedzie się.',
);

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

assert.equal(isPaymentConfirmationUnchanged({
  payment_confirmation_enabled: false,
  payment_amount: null,
  payment_kind: null,
  payment_method: null,
  payment_paid_at: null,
}, { enabled: false }), true);

let noOpSessionCalls = 0;
let noOpUpdateCalls = 0;
const noOpSupabase = {
  auth: {
    async getSession() {
      noOpSessionCalls += 1;
      return { data: { session: { user: { id: 'worker-1' } } }, error: null };
    },
  },
  from() {
    noOpUpdateCalls += 1;
    throw new Error('No-op payment must not touch jobs.');
  },
};
const noOpPatch = await saveJobPaymentConfirmation({
  supabase: noOpSupabase,
  job: {
    id: 'job-finished',
    status: 'Zakończone',
    payment_confirmation_enabled: false,
    payment_amount: null,
    payment_kind: null,
    payment_method: null,
    payment_paid_at: null,
  },
  payment: { enabled: false },
});
assert.equal(noOpSessionCalls, 0);
assert.equal(noOpUpdateCalls, 0);
assert.equal(noOpPatch.payment_confirmation_enabled, false);

console.log('PASS test-job-payment-confirmation-v986');
