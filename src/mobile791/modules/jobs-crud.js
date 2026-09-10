export async function confirmDeleteJobRecord({ supabase, jobToDelete }) {
  if (!supabase || !jobToDelete) return;

  const photoPaths = (jobToDelete.photos || []).map((photo) => photo.storage_path).filter(Boolean);
  if (photoPaths.length) {
    await supabase.storage.from('job-photos').remove(photoPaths);
  }

  const { data, error } = await supabase.from('jobs').delete().eq('id', jobToDelete.id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Brak uprawnień do usunięcia karty albo karta nie została usunięta.');
  }
}

export async function updateJobStatus({ supabase, jobId, status }) {
  if (!supabase) return;
  const { error } = await supabase.from('jobs').update({ status }).eq('id', jobId);
  if (error) throw error;
}

export async function saveJobAdminNote({ supabase, jobId, adminNote }) {
  if (!supabase || !jobId) return null;
  const normalizedAdminNote = String(adminNote || '').trim() || null;
  const { data, error } = await supabase
    .from('jobs')
    .update({ admin_note: normalizedAdminNote })
    .eq('id', jobId)
    .select('id, admin_note')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error('Nie udało się zapisać komentarza administratora. Sprawdź uprawnienia albo odśwież dane.');
  }
  return data;
}
