import { supabaseAnonKey, supabaseUrl } from '../lib/supabase.js';

const COMMENT_DELETE_TIMEOUT_MS = 15000;

export async function sendJobCommentPush({ supabase, jobId, commentId }) {
  if (!supabase || !jobId || !commentId || !supabaseUrl || !supabaseAnonKey) return null;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('Brak aktywnej sesji do wysłania powiadomienia o komentarzu.');

  const response = await fetch(`${supabaseUrl}/functions/v1/send-assignment-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({
      jobId,
      commentId,
      eventType: 'job_comment',
      triggeredBy: 'comment_created',
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || payload?.message || response.statusText || 'Nie udało się wysłać powiadomienia o komentarzu.');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function createTimeoutError(message) {
  const error = new Error(message);
  error.code = "COMMENT_DELETE_TIMEOUT";
  return error;
}

export async function withTimeout(promiseLike, timeoutMs, message) {
  let timeoutId;
  try {
    return await Promise.race([
      Promise.resolve(promiseLike),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(createTimeoutError(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function addJobComment({
  supabase,
  profile,
  jobs,
  profiles,
  jobId,
  type,
  text,
  commentId = null,
  createNotification,
  sendCommentPush = sendJobCommentPush,
  sideEffectsBestEffort = false,
}) {
  if (!supabase || !profile || !text.trim()) return;

  const commentRecord = {
    ...(commentId ? { id: commentId } : {}),
    job_id: jobId,
    author_id: profile.id,
    type,
    text: text.trim(),
  };
  const insertQuery = commentId
    ? supabase.from('comments').upsert(commentRecord, { onConflict: 'id', ignoreDuplicates: true })
    : supabase.from('comments').insert(commentRecord);
  const { data: insertedCommentData, error } = await insertQuery
    .select('id, job_id, author_id, type, text, created_at')
    .maybeSingle();
  if (error) throw error;

  let insertedComment = insertedCommentData;
  if (!insertedComment && commentId) {
    const { data: existingComment, error: existingError } = await supabase
      .from('comments')
      .select('id, job_id, author_id, type, text, created_at')
      .eq('id', commentId)
      .maybeSingle();
    if (existingError) throw existingError;
    insertedComment = existingComment;
  }

  if (profile.role !== 'Administrator' && insertedComment?.id) {
    try {
      await sendCommentPush({ supabase, jobId, commentId: insertedComment.id });
    } catch (pushError) {
      console.warn('Komentarz zapisano, ale push do administratora nie został wysłany:', pushError?.message || pushError);
    }
  }

  const relatedJob = jobs.find((job) => job.id === jobId);
  const targets = new Set();

  if (relatedJob) {
    relatedJob.viewers.forEach((viewer) => {
      if (viewer.user_id !== profile.id) targets.add(viewer.user_id);
    });
  }

  profiles.forEach((person) => {
    if (person.role === 'Administrator' && person.id !== profile.id) targets.add(person.id);
  });

  for (const userId of targets) {
    try {
      await createNotification({
        userId,
        title: 'Nowy komentarz',
        body: `${profile.full_name} dodał komentarz do zlecenia: ${relatedJob?.title || 'Montaż'}`,
        linkJobId: jobId,
      });
    } catch (notificationError) {
      if (!sideEffectsBestEffort) throw notificationError;
      console.warn('Komentarz zapisano, ale nie udało się utworzyć powiadomienia w aplikacji:', notificationError?.message || notificationError);
    }
  }

  return insertedComment;
}

export async function deleteJobComment({
  supabase,
  commentId,
  timeoutMs = COMMENT_DELETE_TIMEOUT_MS,
}) {
  if (!supabase || !commentId) return null;

  const timeoutMessage = 'Usuwanie komentarza trwa zbyt długo. Sprawdź połączenie i odśwież kartę zlecenia.';
  const rpcResponse = await withTimeout(
    supabase.rpc('admin_delete_comment', {
      p_comment_id: commentId,
    }),
    timeoutMs,
    timeoutMessage,
  );

  if (!rpcResponse.error) {
    if (rpcResponse.data === true || rpcResponse.data?.deleted === true) {
      return { id: commentId };
    }
    // Brak rekordu oznacza, że docelowy stan jest już osiągnięty.
    if (rpcResponse.data === false || rpcResponse.data?.deleted === false) {
      return { id: commentId, alreadyDeleted: true };
    }
    throw new Error('Nie udało się usunąć komentarza. Sprawdź uprawnienia administratora w Supabase.');
  }

  const fallbackResponse = await withTimeout(
    supabase
      .from('comments')
      .delete()
      .eq('id', commentId)
      .select('id')
      .maybeSingle(),
    timeoutMs,
    timeoutMessage,
  );

  if (fallbackResponse.error) throw fallbackResponse.error;
  // Usunięcie jest idempotentne: jeśli komentarza już nie ma, uznajemy operację za zakończoną.
  return fallbackResponse.data || { id: commentId, alreadyDeleted: true };
}
