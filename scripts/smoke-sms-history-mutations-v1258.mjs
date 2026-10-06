import assert from 'node:assert/strict';
import fs from 'node:fs';
import { refreshSmsMutationForVisibleHistory } from '../src/modules/sms-ui-flow.js';

const panel = fs.readFileSync(new URL('../src/components/sms/SmsPanel.jsx', import.meta.url), 'utf8');

{
  const events = [];
  let history = ['A:error'];
  await refreshSmsMutationForVisibleHistory({
    showHistory: true,
    reloadSmsData: async ({ silent }) => {
      assert.equal(silent, true);
      events.push('reload');
    },
    refreshAll: async () => events.push('refreshAll'),
    loadFullHistoryPage: async (page) => {
      assert.equal(page, 1);
      events.push('history');
      history = ['B:provider_sent', 'A:error'];
    },
  });
  assert.deepEqual(history, ['B:provider_sent', 'A:error']);
  assert.equal(events.at(-1), 'history');
}

{
  const events = [];
  await refreshSmsMutationForVisibleHistory({
    showHistory: false,
    reloadSmsData: async () => events.push('reload'),
    refreshAll: async () => events.push('refreshAll'),
    loadFullHistoryPage: async () => events.push('history'),
  });
  assert.equal(events.includes('history'), false, 'closed history must not trigger extra history fetch');
}

for (const [startMarker,endMarker] of [
  ['async function handleRetryUnsentSelected()', 'async function handleRetryUnsentNow(row)'],
  ['async function handleRetryUnsentNow(row)', 'function toggleUnsentOne'],
  ['async function handleDeleteUnsentSelected()', 'async function handleDeleteUnsentNow(row)'],
  ['async function handleDeleteUnsentNow(row)', 'function toggleOne(logId)'],
]) {
  const start=panel.indexOf(startMarker);
  const end=panel.indexOf(endMarker,start+1);
  assert(start>=0 && end>start, `missing handler section: ${startMarker}`);
  const section=panel.slice(start,end);
  assert.match(section,/refreshSmsMutationForVisibleHistory\(\{/,`${startMarker} must use shared visible-history invalidation`);
  assert.match(section,/loadFullHistoryPage/,`${startMarker} must wire history page reload`);
}

console.log('PASS: FINAL-SMS-01 retry/unsent-delete refreshes open history and skips closed history');
