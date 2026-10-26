import assert from 'node:assert/strict';
import { createNotification as createMobile } from '../src/mobile791/modules/notifications.js';
import { createNotification as createDesktop } from '../src/modules/notifications.js';
import { addJobComment } from '../src/mobile791/modules/jobs-comments.js';

// WAWIS 13.74 (zgłoszenie 26.10.2026, Kacper): „new row violates row-level security policy for table notifications”.
// Przyczyna (odtworzona na lokalnym PostgreSQL): INSERT … RETURNING musi spełnić politykę SELECT,
// a notifications_read_own pozwala czytać tylko własne powiadomienia — powiadomienie dla administratora padało.

// Atrapa Supabase z tą samą regułą: insert bez zwracania — OK; insert(...).select(...) dla cudzego wiersza — błąd RLS.
function fakeSupabase(currentUserId, inserted = []) {
  return {
    from(table) {
      return {
        insert(row) {
          const rows = Array.isArray(row) ? row : [row];
          const rlsError = { code: '42501', message: `new row violates row-level security policy for table "${table}"` };
          const visible = rows.every((r) => r.user_id === currentUserId);
          inserted.push(...rows);
          const result = Promise.resolve({ data: null, error: null });
          result.select = () => ({ single: async () => (visible ? { data: rows[0], error: null } : { data: null, error: rlsError }) });
          return result;
        },
      };
    },
  };
}

for (const [label, create] of [['mobile', createMobile], ['desktop', createDesktop]]) {
  const inserted = [];
  const result = await create({ supabase: fakeSupabase('worker-1', inserted), userId: 'admin-1', title: 'Nowy komentarz', body: 'x', linkJobId: 'job-1' });
  assert.equal(inserted.length, 1, `${label}: powiadomienie zapisane`);
  assert.equal(result.user_id, 'admin-1', `${label}: zwraca zapisany rekord bez odczytu z bazy`);
}

// Komentarz zapisany → błąd powiadomienia nie jest zgłaszany jako błąd komentarza (bez duplikatów).
const comment = { id: 'c-1', job_id: 'job-1', author_id: 'worker-1', type: 'comment', text: 'Instalacja 5m', created_at: '2026-10-26T09:01:01Z' };
const commentSupabase = {
  from() {
    return { upsert: () => ({ select: () => ({ maybeSingle: async () => ({ data: comment, error: null }) }) }) };
  },
};
const saved = await addJobComment({
  supabase: commentSupabase,
  profile: { id: 'worker-1', role: 'Pracownik', full_name: 'Pracownik' },
  jobs: [{ id: 'job-1', title: 'Paseco', viewers: [] }],
  profiles: [{ id: 'admin-1', role: 'Administrator' }],
  jobId: 'job-1',
  type: 'comment',
  text: 'Instalacja 5m',
  commentId: 'c-1',
  createNotification: async () => { throw { code: '42501', message: 'new row violates row-level security policy for table "notifications"' }; },
  sendCommentPush: async () => {},
});
assert.equal(saved.id, 'c-1');

console.log('smoke-notifications-rls-v1374: OK');
