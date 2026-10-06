import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  refreshSmsMutation,
  refreshSmsMutationWithHistory,
} from '../src/modules/sms-ui-flow.js';

// SMS-04: a refresh may clear UI messages, but the partial-delete report runs after it.
{
  const events = [];
  let errorMessage = 'stare';

  await refreshSmsMutation({
    reloadSmsData: async ({ silent }) => {
      assert.equal(silent, true);
      events.push('reload');
      errorMessage = '';
    },
    refreshAll: async () => {
      events.push('refreshAll');
    },
    afterRefresh: () => {
      events.push('report');
      errorMessage = 'Nie udało się usunąć 1 pozycji. changed state';
    },
  });

  assert.equal(errorMessage, 'Nie udało się usunąć 1 pozycji. changed state');
  assert.equal(events.at(-1), 'report', 'Partial-delete report must happen after every refresh task.');
}

// SMS-05: opening history after a mutation must fetch page 1 after data refresh.
{
  const events = [];
  let historyRows = ['stale'];
  let historyTotal = 999;

  await refreshSmsMutationWithHistory({
    reloadSmsData: async ({ silent }) => {
      assert.equal(silent, true);
      events.push('reload');
      historyRows = [];
      historyTotal = 0;
    },
    refreshAll: async () => {
      events.push('refreshAll');
    },
    loadFullHistoryPage: async (page) => {
      assert.equal(page, 1);
      events.push('history');
      historyRows = ['fresh-send'];
      historyTotal = 1;
    },
  });

  assert.deepEqual(historyRows, ['fresh-send']);
  assert.equal(historyTotal, 1);
  assert.equal(events.at(-1), 'history', 'History page must be fetched after refresh, not merely opened.');
}

// Wiring proof is supplementary; behavioral assertions above are the primary evidence.
const panel = fs.readFileSync(
  new URL('../src/components/sms/SmsPanel.jsx', import.meta.url),
  'utf8',
);
assert.match(panel, /handleSendSelected[\s\S]*?refreshSmsMutationWithHistory\(\{/);
assert.match(panel, /handleSendNow[\s\S]*?refreshSmsMutationWithHistory\(\{/);
assert.match(panel, /handleDeleteSelected[\s\S]*?afterRefresh:\s*\(\) => reportDeleteResult/);
assert.match(panel, /handleDeleteUnsentSelected[\s\S]*?afterRefresh:\s*\(\) => reportDeleteResult/);

console.log('PASS: SMS-04 partial delete message survives refresh and SMS-05 history is freshly loaded');
