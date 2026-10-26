export async function createNotification({ supabase, userId, title, body, linkJobId = null }) {
  if (!supabase) return null;

  // WAWIS 13.74: bez .select() — powiadomienie jest dla innej osoby, a polityka odczytu
  // (notifications_read_own) pozwala czytać tylko własne. INSERT … RETURNING musi spełnić także
  // politykę SELECT, więc kończył się błędem „new row violates row-level security policy”
  // (od 03.09.2026 żadne powiadomienie w aplikacji nie zostało zapisane).
  const record = {
    user_id: userId,
    title,
    body,
    link_job_id: linkJobId,
    is_read: false,
  };
  const { error } = await supabase
    .from('notifications')
    .insert(record);

  if (error) {
    console.error('createNotification failed', error);
    throw error;
  }

  return record;
}

export async function markNotificationAsRead({ supabase, notificationId, refreshAll, sessionUser }) {
  if (!supabase) return;

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) {
    console.error('markNotificationAsRead failed', error);
    throw error;
  }

  await refreshAll(sessionUser);
}
