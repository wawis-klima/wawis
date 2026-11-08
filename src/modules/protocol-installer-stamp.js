// WAWIS 14.39 — podpis instalatora w protokołach montażu zapisanych przed 14.38 (decyzja właściciela 08.11.2026).
// Dla każdego takiego protokołu: pobranie PDF → dopisanie wzoru podpisu instalatora (pdf-stamp: oryginalna treść bez
// zmian) → kontrola → zapis jako NOWA wersja pliku. Poprzedni plik zostaje w Storage i w historii wersji protokołu
// („Poprzednie wersje protokołu → Pobierz starszy PDF”). Data podpisu klienta, podpis klienta, dane i notatka — bez zmian.
// Instalator: osoba, która zakończyła montaż; gdy brak — instalator przypisany w próbach szczelności (14.32).
// Wymaga konta administratora (zapis protokołów zakończonych montaży). Błąd jednego protokołu nie przerywa reszty.

import { addInstallerSignatureToPdf } from './pdf-stamp.js';
import { loadLeakTests, loadStaffSignaturesAdmin } from './leak-tests.js';

export const INSTALLER_SIGNATURE_CUTOFF = '2026-11-08T16:22:00Z'; // wdrożenie 14.38 — nowsze mają podpis od razu
export const STAMP_KIND = 'installer_signature_added';

export function alreadyStamped(record) {
  return (Array.isArray(record?.revision_history) ? record.revision_history : []).some((entry) => entry?.reason === STAMP_KIND);
}

/** Protokoły do uzupełnienia: { record, job, installerId, installerName, png, reason } (reason → pominięty). */
export async function listProtocolsForInstallerSignature({ supabase }) {
  const { data, error } = await supabase.from('job_protocols')
    .select('id, job_id, storage_path, file_name, file_size_bytes, signed_at, created_at, created_by, note, signature_path, signed_snapshot, revision_history, correction_kind');
  if (error) throw new Error(`Nie udało się pobrać protokołów: ${error.message || 'błąd'}`);
  const records = (data || []).filter((row) => row?.storage_path && String(row.created_at || '') < INSTALLER_SIGNATURE_CUTOFF && !alreadyStamped(row));
  if (!records.length) return [];
  const ids = [...new Set(records.map((row) => String(row.job_id)))];
  const jobs = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const res = await supabase.from('jobs').select('id, client, city, status, completed_by').in('id', ids.slice(i, i + 100));
    if (res.error) throw new Error(`Nie udało się pobrać montaży: ${res.error.message || 'błąd'}`);
    (res.data || []).forEach((job) => jobs.set(String(job.id), job));
  }
  const [leakRows, signatures] = await Promise.all([
    loadLeakTests({ supabase }).catch(() => []),
    loadStaffSignaturesAdmin({ supabase }),
  ]);
  const leakInstaller = new Map(leakRows.map((row) => [String(row.job_id), row.installer_id ? String(row.installer_id) : '']));
  const people = new Map(signatures.map((row) => [String(row.profile_id), row]));
  return records.map((record) => {
    const job = jobs.get(String(record.job_id)) || { id: record.job_id };
    const installerId = String(job.completed_by || leakInstaller.get(String(record.job_id)) || '');
    const person = people.get(installerId);
    let reason = '';
    if (!installerId) reason = 'brak instalatora';
    else if (!person?.image_png) reason = `brak wzoru podpisu (${person?.full_name || 'instalator'})`;
    return { record, job, installerId, installerName: person?.full_name || '', png: person?.image_png || '', reason };
  }).sort((a, b) => String(a.record.signed_at || '').localeCompare(String(b.record.signed_at || '')));
}

function newStoragePath(jobId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 12);
  return `${jobId}/protocol-${stamp}-podpis-instalatora-${suffix}.pdf`;
}

/** Jeden protokół. Zwraca zaktualizowany rekord. */
export async function stampOneProtocol({ supabase, item, userId }) {
  const { record, png } = item;
  const download = await supabase.storage.from('job-protocols').download(record.storage_path);
  if (download.error || !download.data) throw new Error(`nie udało się pobrać PDF (${download.error?.message || 'brak pliku'})`);
  const original = new Uint8Array(await download.data.arrayBuffer());
  const stamped = await addInstallerSignatureToPdf(original, png);
  const path = newStoragePath(record.job_id);
  const blob = new Blob([stamped], { type: 'application/pdf' });
  const upload = await supabase.storage.from('job-protocols').upload(path, blob, { cacheControl: '3600', contentType: 'application/pdf', upsert: false });
  if (upload.error) throw new Error(`nie udało się zapisać nowej wersji (${upload.error.message || 'błąd'})`);
  const history = [
    ...(Array.isArray(record.revision_history) ? record.revision_history : []),
    {
      storage_path: record.storage_path, file_name: record.file_name, signed_at: record.signed_at,
      archived_at: new Date().toISOString(), correction_kind: record.correction_kind || null,
      created_by: record.created_by || null, reason: STAMP_KIND,
    },
  ];
  // Tylko plik i historia; created_by = administrator (wymóg uprawnień). Podpis klienta i dane bez zmian.
  const { data, error } = await supabase.from('job_protocols')
    .update({ storage_path: path, file_size_bytes: blob.size, revision_history: history, created_by: userId })
    .eq('id', record.id).eq('storage_path', record.storage_path)
    .select('id, storage_path').single();
  if (error || !data || data.storage_path !== path) {
    // Nowy plik zostaje w Storage (nigdy nie kasujemy po niejednoznacznym zapisie); rekord wskazuje na oryginał.
    throw new Error(`nie udało się podmienić wersji (${error?.message || 'protokół zmieniony w międzyczasie'})`);
  }
  return data;
}

/** Wszystkie: onProgress({ done, total }); zwraca { stamped, skipped: [{ name, reason }] }. */
export async function stampAllProtocols({ supabase, items, onProgress = () => {}, signal = null }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) throw new Error('Brak zalogowanego użytkownika.');
  const ready = items.filter((item) => !item.reason);
  const skipped = items.filter((item) => item.reason).map((item) => ({ name: label(item), reason: item.reason }));
  let stamped = 0;
  let done = 0;
  for (const item of ready) {
    if (signal?.aborted) break;
    try {
      await stampOneProtocol({ supabase, item, userId });
      stamped += 1;
    } catch (err) {
      skipped.push({ name: label(item), reason: err?.message || 'błąd' });
    }
    done += 1;
    onProgress({ done, total: ready.length });
  }
  return { stamped, skipped, aborted: Boolean(signal?.aborted) };
}

function label(item) {
  return [item.job?.client, item.job?.city].filter(Boolean).join(', ') || String(item.record?.job_id || '').slice(0, 8);
}
