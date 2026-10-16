import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runWithAbortableDeadline } from '../src/modules/details-deadline.js';

// Prawidłowa odpowiedź zachowuje pełne dane i nie anuluje zapytania.
const okController = new AbortController();
assert.deepEqual(
  await runWithAbortableDeadline(() => Promise.resolve({ comments: [1], photos: [2] }), {
    controller: okController,
    timeoutMs: 100,
  }),
  { comments: [1], photos: [2] },
);
assert.equal(okController.signal.aborted, false);

// Nigdy nierozstrzygnięte żądanie musi mieć twardy limit, niezależnie od abort().
const hangingController = new AbortController();
const started = Date.now();
await assert.rejects(
  runWithAbortableDeadline(() => new Promise(() => {}), {
    controller: hangingController,
    timeoutMs: 20,
  }),
  (error) => error?.name === 'AbortError',
);
assert.equal(hangingController.signal.aborted, true);
assert(Date.now() - started < 300, 'Żądanie nie może zawiesić całego widoku');

// Rzeczywisty błąd sieciowy nie może zostać zamieniony w fałszywy sukces.
await assert.rejects(
  runWithAbortableDeadline(() => Promise.reject(new Error('503')), { timeoutMs: 100 }),
  /503/,
);

// Po pierwszym zalogowaniu nie wolno zapamiętać pominiętej próby na zawsze.
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/components/JobDetailsPanel.jsx', import.meta.url), 'utf8');
assert.match(app, /const jobDetailsStartupRecoveryRef = useRef\(''\)/);
assert.match(app, /jobDetailsAutoLoadRef\.current = '';/);
assert.match(app, /selectedJobRef\.current = selectedJob/);
assert.match(app, /runWithAbortableDeadline\(/);
assert.match(app, /jobDetailsStartupRecoveryRef\.current === selectedId/);
assert.match(app, /showMissingError: true/);
assert.match(app, /detailsLoadError: message/);
assert.match(panel, /onRetryDetails/);
assert.match(panel, /Ładowanie zdjęć/);
console.log('OK: desktop initial details hard deadline and startup recovery');
