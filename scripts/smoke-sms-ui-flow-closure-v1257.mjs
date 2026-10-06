import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  refreshSmsMutation,
  refreshSmsMutationWithHistory,
} from '../src/modules/sms-ui-flow.js';

const panel = fs.readFileSync(new URL('../src/components/sms/SmsPanel.jsx', import.meta.url), 'utf8');

// SMS-04: refresh może wyczyścić stary komunikat, ale raport częściowego delete
// musi zostać ustawiony dopiero po zakończeniu wszystkich refreshy.
{
  const events = [];
  let errorMessage = 'stary błąd';

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
      events.push('afterRefresh');
      errorMessage = 'Nie udało się usunąć 1 pozycji. changed state';
    },
  });

  assert.equal(errorMessage, 'Nie udało się usunąć 1 pozycji. changed state');
  assert(events.indexOf('afterRefresh') > events.indexOf('reload'));
  assert(events.indexOf('afterRefresh') > events.indexOf('refreshAll'));
}

// SMS-05: historia nie może być ładowana przed zakończeniem refreshu snapshotu.
{
  const events = [];
  let releaseReload;
  let releaseRefresh;
  const reloadGate = new Promise((resolve) => { releaseReload = resolve; });
  const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });

  const running = refreshSmsMutationWithHistory({
    reloadSmsData: async () => {
      events.push('reload:start');
      await reloadGate;
      events.push('reload:end');
    },
    refreshAll: async () => {
      events.push('refreshAll:start');
      await refreshGate;
      events.push('refreshAll:end');
    },
    loadFullHistoryPage: async (page) => {
      events.push(`history:${page}`);
    },
  });

  await Promise.resolve();
  await Promise.resolve();
  assert.equal(events.some((event) => event.startsWith('history:')), false);

  releaseReload();
  await Promise.resolve();
  assert.equal(events.some((event) => event.startsWith('history:')), false);

  releaseRefresh();
  await running;

  assert.equal(events.at(-1), 'history:1');
  assert(events.indexOf('history:1') > events.indexOf('reload:end'));
  assert(events.indexOf('history:1') > events.indexOf('refreshAll:end'));
}

// Wiring: oba przepływy wysyłki muszą używać refresh + świeżej historii.
const sendSelectedStart = panel.indexOf('async function handleSendSelected()');
const sendNowStart = panel.indexOf('async function handleSendNow(job)');
const deletePayloadStart = panel.indexOf('function buildDeletePayload');
assert(sendSelectedStart >= 0 && sendNowStart > sendSelectedStart && deletePayloadStart > sendNowStart);

const sendSelected = panel.slice(sendSelectedStart, sendNowStart);
const sendNow = panel.slice(sendNowStart, deletePayloadStart);
assert.match(sendSelected, /refreshSmsMutationWithHistory\(\{/);
assert.match(sendSelected, /loadFullHistoryPage/);
assert.match(sendNow, /refreshSmsMutationWithHistory\(\{/);
assert.match(sendNow, /loadFullHistoryPage/);

// Wiring: raport delete musi zostać ustawiony po refreshu, nie przed nim.
for (const [startMarker, endMarker] of [
  ['async function handleDeleteSelected()', 'async function handleDeleteNow(job)'],
  ['async function handleDeleteNow(job)', 'async function handleRetryUnsentSelected()'],
  ['async function handleDeleteUnsentSelected()', 'async function handleDeleteUnsentNow(row)'],
  ['async function handleDeleteUnsentNow(row)', 'function toggleOne(logId)'],
]) {
  const start = panel.indexOf(startMarker);
  const end = panel.indexOf(endMarker, start + 1);
  assert(start >= 0 && end > start, `missing section ${startMarker}`);
  const section = panel.slice(start, end);
  assert.match(section, /afterRefresh:\s*\(\) => reportDeleteResult\(/);
}

assert.match(
  panel.slice(panel.indexOf('async function reloadSmsData'), panel.indexOf('async function reloadSettingsOnly')),
  /setErrorMessage\(''\)/,
  'regression fixture must model reload clearing the current error message',
);

console.log('PASS: SMS-04 partial delete message survives refresh + SMS-05 history reloads after send');
