export async function confirmDeleteJobRecord({ supabase, jobToDelete }) {
  if (!supabase || !jobToDelete) return;

  const jobId = String(jobToDelete.id || '').trim();
  if (!jobId) throw new Error('Brak identyfikatora karty do usunięcia.');

  // K6 / 11.74: plików nie wolno usuwać przed potwierdzeniem DELETE.
  // Produkcyjny archive_job_before_delete zapisuje pełny snapshot (w tym photos)
  // do prywatnego kosza, dlatego pliki Storage muszą zostać zachowane na potrzeby
  // ewentualnego przywrócenia. Jedyną ścieżką usuwania karty jest recoverable RPC.
  const { data, error } = await supabase.rpc('admin_delete_jobs_recoverable', {
    p_ids: [jobId],
    p_only_unlinked: false,
  });
  if (error) throw error;

  const deletedJobIds = (data || []).map((item) => String(item?.id || '').trim()).filter(Boolean);
  if (!deletedJobIds.includes(jobId)) {
    throw new Error('Brak uprawnień do usunięcia karty albo karta nie została usunięta.');
  }

  return { deletedJobIds };
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
