import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addJobComment } from '../src/modules/jobs-comments.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

function createCommentSupabase(commentId) {
  const state = { inserted: null };
  return {
    state,
    from(table) {
      assert.equal(table, 'comments');
      return {
        insert(payload) {
          state.inserted = payload;
          return {
            select() {
              return {
                async single() {
                  return {
                    data: { id: commentId, ...payload, created_at: '2026-08-14T12:00:00.000Z' },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

async function addForProfile(profile, { pushFails = false } = {}) {
  const supabase = createCommentSupabase(`comment-${profile.id}`);
  const pushes = [];
  const notifications = [];
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await addJobComment({
      supabase,
      profile,
      jobs: [{ id: 'job-1', title: 'Montaż testowy', viewers: [] }],
      profiles: [{ id: 'admin-1', role: 'Administrator', full_name: 'Administrator' }],
      jobId: 'job-1',
      type: 'Komentarz',
      text: 'Proszę sprawdzić odpływ.',
      createNotification: async (payload) => notifications.push(payload),
      sendCommentPush: async (payload) => {
        pushes.push(payload);
        if (pushFails) throw new Error('push unavailable');
        return { ok: true };
      },
    });
    return { result, supabase, pushes, notifications };
  } finally {
    console.warn = originalWarn;
  }
}

const workerResult = await addForProfile({ id: 'worker-1', role: 'Pracownik', full_name: 'Jan Monter' });
assert.equal(workerResult.result.id, 'comment-worker-1');
assert.equal(workerResult.supabase.state.inserted.author_id, 'worker-1');
assert.deepEqual(workerResult.pushes, [{ supabase: workerResult.supabase, jobId: 'job-1', commentId: 'comment-worker-1' }]);
assert.equal(workerResult.notifications.length, 1, 'Powiadomienie w aplikacji dla administratora musi pozostać');

const adminResult = await addForProfile({ id: 'admin-1', role: 'Administrator', full_name: 'Administrator' });
assert.equal(adminResult.pushes.length, 0, 'Komentarz administratora nie może wysyłać push do administratora');

const failedPushResult = await addForProfile({ id: 'worker-2', role: 'Pracownik', full_name: 'Anna Monter' }, { pushFails: true });
assert.equal(failedPushResult.result.id, 'comment-worker-2', 'Awaria push nie może cofać zapisanego komentarza');
assert.equal(failedPushResult.notifications.length, 1, 'Awaria push nie może blokować powiadomienia wewnątrz aplikacji');

for (const rel of ['src/modules/jobs-comments.js', 'src/mobile791/modules/jobs-comments.js']) {
  const source = read(rel);
  assert.match(source, /eventType: 'job_comment'/, `${rel}: brak wywołania job_comment`);
  assert.match(source, /profile\.role !== 'Administrator'/, `${rel}: komentarz administratora nie jest wykluczony`);
  assert.match(source, /Komentarz zapisano, ale push do administratora nie został wysłany/, `${rel}: błąd push może być mylony z błędem zapisu komentarza`);
}

const edge = read('supabase/functions/send-assignment-push/index.ts');
assert.match(edge, /eventType === "job_comment"/);
assert.match(edge, /String\(comment\.author_id \|\| ""\) !== String\(authUserId\)/, 'Edge musi potwierdzić autora komentarza');
assert.match(edge, /\.from\("job_access"\)/, 'Edge musi potwierdzić dostęp pracownika do zlecenia');
assert.match(edge, /\.eq\("role", "Administrator"\)/, 'Push musi wybierać administratorów po profilu serwerowym');
assert.match(edge, /deliveryLogType = `job_comment:\$\{comment\.id\}`/, 'Każdy komentarz musi mieć osobny klucz antyduplikacyjny');
assert.match(edge, /title: "Nowy komentarz do montażu"/);
assert.match(edge, /tag: `job-comment-\$\{comment\.id\}`/);

console.log('OK: komentarz pracownika wysyła bezpieczny, idempotentny push administratorowi i nie cofa zapisu przy awarii push.');
