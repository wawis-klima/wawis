import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runWithAbortableDeadline } from '../src/modules/details-deadline.js';
import { preserveLatestLoadedJobDetails } from '../src/modules/job-details-preservation.js';

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

// Pełny snapshot listy przychodzący po szczegółach nie może wyczyścić zdjęć.
const loaded = {
  id: 'job-1', status: 'Nowe', photos: [{ id: 'photo-1', thumbnail_image_url: 'signed' }],
  comments: [{ id: 'comment-1' }], detailsLoaded: true,
  detailsLoadedAt: '2026-10-16T09:30:00.000Z', detailsLoadError: '',
};
const lateList = { id: 'job-1', status: 'W trakcie', photos: [], comments: [], detailsLoaded: false };
const preserved = preserveLatestLoadedJobDetails([lateList], [loaded])[0];
assert.equal(preserved.detailsLoaded, true);
assert.equal(preserved.status, 'W trakcie', 'Aktualizacja statusu montażu nie może zostać cofnięta');
assert.deepEqual(preserved.photos, loaded.photos);
assert.deepEqual(preserved.comments, loaded.comments);
assert.equal(preserved.detailsLoadError, '');
assert.equal(preserveLatestLoadedJobDetails([{ id: 'job-2', detailsLoaded: false }], [loaded])[0].detailsLoaded, false);
assert.deepEqual(
  preserveLatestLoadedJobDetails([{ ...loaded, detailsLoadedAt: '2026-10-16T10:00:00.000Z', photos: [{ id: 'newer' }] }], [loaded])[0].photos,
  [{ id: 'newer' }],
);

// Po pierwszym zalogowaniu nie wolno zapamiętać pominiętej próby na zawsze.
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/components/JobDetailsPanel.jsx', import.meta.url), 'utf8');
const session = readFileSync(new URL('../src/hooks/useAppSession.js', import.meta.url), 'utf8');
assert.match(session, /preserveLatestLoadedJobDetails\(freshJobs, jobsRef\.current\)/);
assert.match(session, /preserveLatestLoadedJobDetails\(payload\.jobs, jobsRef\.current\)/);
assert.match(session, /preserveLatestLoadedJobDetails\(finalJobs, previous\)/);
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
