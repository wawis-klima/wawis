// WAWIS 13.87 — odświeżanie przyrostowe nie cofa otwartego montażu do starej kopii (miniatury znikały).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyIncrementalJobChange, rebaseIncrementalJobChanges } from '../src/modules/incremental-job-changes.js';

// Odtworzenie zgłoszenia (Biała 4a, 27.10.2026):
// 1. odświeżanie przyrostowe startuje z listą, w której montaż nie ma jeszcze zdjęć,
const startSnapshot = [
  { id: 'job-a', client: 'Biała 4a', status: 'W trakcie', photos: [], comments: [], detailsLoaded: false },
  { id: 'job-b', client: 'Inny', status: 'Nowe', photos: [], comments: [], detailsLoaded: false },
];
// 2. w tym czasie właściciel otwiera montaż — aplikacja pobiera zdjęcia i podpisuje miniatury,
const latest = [
  {
    ...startSnapshot[0],
    detailsLoaded: true,
    comments: [{ id: 'c1', text: 'ok' }],
    photos: [
      { id: 'p1', storage_path: 'job-a/1.jpg', thumbnail_image_url: 'https://signed/thumb-1' },
      { id: 'p2', storage_path: 'job-a/2.jpg', thumbnail_image_url: 'https://signed/thumb-2' },
    ],
  },
  startSnapshot[1],
];
// 3. serwer zgłasza zmianę tego montażu (pracownik dodał tabliczkę) i zmianę innego montażu.
const changes = [
  { jobId: 'job-a', summary: { job: { id: 'job-a', client: 'Biała 4a', status: 'W trakcie', updated_marker: 2 }, viewers: [{ user_id: 'u1' }] } },
  { jobId: 'job-b', summary: { job: { id: 'job-b', client: 'Inny', status: 'W trakcie' }, viewers: [] } },
];

// Stare zachowanie: zmiany na kopii z początku → zdjęcia/miniatury przepadają.
let stale = startSnapshot;
for (const change of changes) stale = applyIncrementalJobChange(stale, change.jobId, change.summary);
assert.equal(stale[0].photos.length, 0, 'kontrola: kopia z początku nie ma zdjęć (tak wyglądał błąd)');

// Nowe zachowanie: zmiany na najnowszej liście → zdjęcia, miniatury i komentarze zostają, dane z serwera są nowe.
const rebased = rebaseIncrementalJobChanges(latest, changes);
const jobA = rebased.find((job) => job.id === 'job-a');
assert.equal(jobA.photos.length, 2, 'zdjęcia otwartego montażu zostają');
assert.deepEqual(jobA.photos.map((p) => p.thumbnail_image_url), ['https://signed/thumb-1', 'https://signed/thumb-2'], 'miniatury zostają');
assert.equal(jobA.detailsLoaded, true);
assert.equal(jobA.comments.length, 1);
assert.equal(jobA.updated_marker, 2, 'dane montażu z serwera są zastosowane');
assert.deepEqual(jobA.viewers, [{ user_id: 'u1' }]);
assert.equal(rebased.find((job) => job.id === 'job-b').status, 'W trakcie', 'inne zmiany też są zastosowane');

// Usunięty montaż znika, nowy pojawia się na górze — jak dotychczas.
const removed = rebaseIncrementalJobChanges(latest, [{ jobId: 'job-b', summary: { missing: true } }]);
assert.deepEqual(removed.map((job) => job.id), ['job-a']);
const added = rebaseIncrementalJobChanges(latest, [{ jobId: 'job-new', summary: { job: { id: 'job-new' }, viewers: [] } }]);
assert.equal(added[0].id, 'job-new');
assert.equal(added.length, 3);
assert.equal(rebaseIncrementalJobChanges(latest, []), latest, 'brak zmian = ta sama lista');

// Obie wersje (telefon i komputer) zapisują wynik nałożony na najnowszą listę (jobsRef.current).
for (const file of ['src/mobile791/hooks/useAppSession.js', 'src/hooks/useAppSession.js']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /appliedChanges\.push\(\{ jobId: change\.jobId, summary \}\)/, `${file}: zapamiętuje zmiany`);
  assert.match(source, /rebaseIncrementalJobChanges\(Array\.isArray\(jobsRef\.current\) \? jobsRef\.current : workingJobs, appliedChanges\)/, `${file}: nakłada zmiany na najnowszą listę`);
  assert.doesNotMatch(source, /jobsRef\.current = workingJobs;/, `${file}: nie zapisuje kopii z początku odświeżania`);
  assert.doesNotMatch(source, /applyOfflineOperationsToJobs\(workingJobs, operations, profileRef\.current \|\| \{\}\);\s*jobsRef\.current/, `${file}: nie zapisuje kopii z początku odświeżania`);
}

console.log('OK smoke-incremental-rebase-v1387: odświeżanie przyrostowe zachowuje zdjęcia i miniatury otwartego montażu');
