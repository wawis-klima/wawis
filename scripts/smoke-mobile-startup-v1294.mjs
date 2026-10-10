import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMockSupabaseClient } from '../src/mobile791/lib/mockSupabaseClient.js';
import { refreshAppData } from '../src/mobile791/modules/jobs-fetch.js';

const gate = () => {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
};
const waitFor = (promise, name) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout testu: ' + name)), 1500)),
]);

function fixture({ slowJobs = false, slowProfile = false, profileFailure = false } = {}) {
  const client = createMockSupabaseClient();
  const jobsGate = gate();
  const profileGate = gate();
  const originalFrom = client.from.bind(client);
  const supabase = {
    ...client,
    from(table) {
      const query = originalFrom(table);
      const originalExecute = query.execute.bind(query);
      query.execute = async () => {
        if (table === 'jobs' && slowJobs) await jobsGate.promise;
        if (table === 'profiles' && query.maybeSingleMode && slowProfile) await profileGate.promise;
        if (table === 'profiles' && query.maybeSingleMode && profileFailure) {
          return { data: null, error: { status: 504, message: 'context deadline exceeded' } };
        }
        return originalExecute();
      };
      return query;
    },
  };
  return { supabase, user: client.__mock.store.users[0], jobsGate, profileGate };
}

function start({ supabase, user }, events) {
  return refreshAppData({
    supabase, user,
    onProfileReady: (profile) => events.push('profile:' + profile.role),
    onJobsReady: (jobs) => events.push('jobs:' + jobs.length),
  });
}

{
  const state = fixture({ slowJobs: true });
  const events = [];
  let profileReady;
  const profileSignal = new Promise((resolve) => { profileReady = resolve; });
  const running = refreshAppData({
    supabase: state.supabase, user: state.user,
    onProfileReady(profile) { events.push('profile:' + profile.role); profileReady(); },
    onJobsReady(jobs) { events.push('jobs:' + jobs.length); },
  });
  await waitFor(profileSignal, 'profil przed wolnymi montażami');
  assert.deepEqual(events, ['profile:Administrator']);
  state.jobsGate.release();
  const payload = await waitFor(running, 'koniec montażów');
  assert.ok(payload.jobs.length > 0);
  assert.equal(events[1], 'jobs:' + payload.jobs.length);
}

{
  const state = fixture({ slowProfile: true });
  const events = [];
  let jobsReady;
  const jobsSignal = new Promise((resolve) => { jobsReady = resolve; });
  const running = refreshAppData({
    supabase: state.supabase, user: state.user,
    onProfileReady(profile) { events.push('profile:' + profile.role); },
    onJobsReady(jobs) { events.push('jobs:' + jobs.length); jobsReady(); },
  });
  await waitFor(jobsSignal, 'montaże przed wolnym profilem');
  assert.equal(events.length, 1);
  assert.match(events[0], /^jobs:/);
  state.profileGate.release();
  const payload = await waitFor(running, 'profil');
  assert.equal(payload.profile.role, 'Administrator');
  assert.deepEqual(events.map((event) => event.split(':')[0]), ['jobs', 'profile']);
}

{
  const state = fixture({ profileFailure: true });
  const events = [];
  const payload = await waitFor(start(state, events), 'profil 504');
  assert.ok(payload.jobs.length > 0);
  assert.equal(events.some((event) => event.startsWith('profile:')), false,
    '504 / profil niezweryfikowany nie może odblokować roli admina');
}

const session = fs.readFileSync(new URL('../src/mobile791/hooks/useAppSession.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/mobile791/App.jsx', import.meta.url), 'utf8');
assert.match(session, /onProfileReady: \(freshProfile\) => applyProfileFirst\(freshProfile\)/);
assert.match(session, /String\(freshProfile\.id \|\| ''\) !== userId/);
assert.match(app, /if \(!profile\) \{\s*return <StartupLoadingScreen/);
assert.match(app, /setIsSlow\(true\), 7000/);
assert.match(app, /Ponów pobieranie danych/);
console.log('OK: mobile 12.94 — równoległy profil i montaże, brak awansu uprawnień po 504, fallback 7 s.');
