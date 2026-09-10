export async function createNotification({ supabase, userId, title, body, linkJobId = null }) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      title,
      body,
      link_job_id: linkJobId,
      is_read: false,
    })
    .select('id, user_id, title, body, is_read, created_at, link_job_id')
    .single();

  if (error) {
    console.error('createNotification failed', error);
    throw error;
  }

  return data;
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
