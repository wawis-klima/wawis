// WAWIS 14.37 — pobieranie zbiorcze protokołów (zakładka „Protokoły”, administrator; decyzja właściciela 08.11.2026).
// Jeden plik ZIP z wybranego zakresu dat:
//   „Protokoły montażu/” — zapisane PDF-y podpisane przez klienta (tabela job_protocols, bucket job-protocols),
//   „Protokoły szczelności/” — PDF-y generowane z danych próby (leak_test_records) z podpisem ze wzoru instalatora.
// Data do zakresu: protokół montażu — dzień zakończenia montażu (czas polski; brak → data montażu → data podpisu);
// protokół szczelności — data badania (= dzień zakończenia). Tylko odczyt — nic nie zapisuje (poza brakującą
// temperaturą, jak przy zwykłym otwarciu PDF). Błąd jednego pliku nie przerywa całości — trafia do listy „Pominięte”.

import { createZipBlob } from './zip-store.js';
import { loadLeakTest, loadLeakTests } from './leak-tests.js';

const JOB_COLUMNS = 'id, client, city, street, status, device_model, device_serial_number, completed_at, completed_by, installation_date';

export function warsawDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function inRange(day, from, to) {
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/** Bezpieczna nazwa pliku: „2026-11-05 Piotr Kulis, Zawiercie.pdf”. */
export function protocolEntryName(day, job = {}) {
  const parts = [job.client, job.city].map((value) => String(value || '').trim()).filter(Boolean);
  const label = (parts.join(', ') || String(job.id || 'montaz').slice(0, 8))
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
  return `${day || 'bez-daty'} ${label}.pdf`;
}

async function fetchJobs(supabase, ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  const map = new Map();
  for (let i = 0; i < unique.length; i += 100) {
    const { data, error } = await supabase.from('jobs').select(JOB_COLUMNS).in('id', unique.slice(i, i + 100));
    if (error) throw new Error(`Nie udało się pobrać danych montaży: ${error.message || 'błąd'}`);
    (data || []).forEach((job) => map.set(String(job.id), job));
  }
  return map;
}

async function runPool(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next; next += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

/** Lista protokołów montażu w zakresie (bez pobierania plików). */
export async function listClientProtocols({ supabase, from = '', to = '' }) {
  const { data, error } = await supabase.from('job_protocols').select('id, job_id, storage_path, file_name, signed_at, created_at');
  if (error) throw new Error(`Nie udało się pobrać listy protokołów montażu: ${error.message || 'błąd'}`);
  const records = (data || []).filter((row) => row?.storage_path);
  const jobs = await fetchJobs(supabase, records.map((row) => row.job_id));
  return records.map((record) => {
    const job = jobs.get(String(record.job_id)) || { id: record.job_id };
    const day = warsawDate(job.completed_at) || String(job.installation_date || '').slice(0, 10) || warsawDate(record.signed_at || record.created_at);
    return { record, job, day };
  }).filter((item) => inRange(item.day, from, to)).sort((a, b) => a.day.localeCompare(b.day));
}

/** Lista protokołów szczelności w zakresie (wpisy z datą badania). */
export async function listLeakProtocols({ supabase, from = '', to = '' }) {
  const rows = await loadLeakTests({ supabase });
  return rows.filter((row) => row.test_date && inRange(String(row.test_date).slice(0, 10), from, to))
    .map((row) => ({ row, day: String(row.test_date).slice(0, 10) }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export async function countProtocols({ supabase, from = '', to = '', kinds = { client: true, leak: true } }) {
  const [client, leak] = await Promise.all([
    kinds.client ? listClientProtocols({ supabase, from, to }) : [],
    kinds.leak ? listLeakProtocols({ supabase, from, to }) : [],
  ]);
  return { client: client.length, leak: leak.length };
}

/**
 * Buduje ZIP. onProgress({ done, total }) po każdym pliku. signal (AbortSignal) — przerwanie.
 * Zwraca { blob, fileName, added: { client, leak }, skipped: [{ name, reason }] }.
 */
export async function buildProtocolsZip({ supabase, from = '', to = '', kinds = { client: true, leak: true }, onProgress = () => {}, signal = null }) {
  const [clientItems, leakItems] = await Promise.all([
    kinds.client ? listClientProtocols({ supabase, from, to }) : [],
    kinds.leak ? listLeakProtocols({ supabase, from, to }) : [],
  ]);
  const total = clientItems.length + leakItems.length;
  if (!total) throw new Error('Brak protokołów w wybranym zakresie dat.');

  const entries = [];
  const skipped = [];
  const added = { client: 0, leak: 0 };
  let done = 0;
  const tick = () => { done += 1; onProgress({ done, total }); };
  const aborted = () => { if (signal?.aborted) throw new DOMException('Przerwano pobieranie.', 'AbortError'); };

  await runPool(clientItems, 4, async ({ record, job, day }) => {
    aborted();
    const name = `Protokoły montażu/${protocolEntryName(day, job)}`;
    try {
      const { data, error } = await supabase.storage.from('job-protocols').download(record.storage_path);
      if (error || !data) throw new Error(error?.message || 'brak pliku');
      entries.push({ name, data, date: new Date(record.signed_at || record.created_at || Date.now()), sort: `a${day}${name}` });
      added.client += 1;
    } catch (err) {
      skipped.push({ name, reason: err?.message || 'błąd pobierania' });
    }
    tick();
  });

  if (leakItems.length) {
    const jobs = await fetchJobs(supabase, leakItems.map((item) => item.row.job_id));
    const { createLeakTestProtocolPdfBlob, withBackgroundTemperature } = await import('../mobile791/modules/leak-test-protocol-pdf.js');
    await runPool(leakItems, 3, async ({ row, day }) => {
      aborted();
      const job = jobs.get(String(row.job_id)) || { id: row.job_id, client: row.client, city: row.city, street: row.street, device_model: row.device_model };
      const name = `Protokoły szczelności/${protocolEntryName(day, job)}`;
      try {
        let record = await loadLeakTest({ supabase, jobId: row.job_id });
        record = await withBackgroundTemperature({ supabase, job, record });
        const installerId = row.installer_id || row.completed_by;
        const profiles = installerId ? [{ id: installerId, full_name: row.installer_name || row.completed_by_name }] : [];
        const { blob } = await createLeakTestProtocolPdfBlob({ job: { ...job, completed_by: installerId || job.completed_by }, profiles, record });
        entries.push({ name, data: blob, date: new Date(`${day}T12:00:00`), sort: `b${day}${name}` });
        added.leak += 1;
      } catch (err) {
        skipped.push({ name, reason: err?.message || 'błąd tworzenia PDF' });
      }
      tick();
    });
  }

  aborted();
  if (!entries.length) throw new Error('Nie udało się przygotować żadnego protokołu.');
  entries.sort((a, b) => a.sort.localeCompare(b.sort));
  if (skipped.length) {
    entries.push({ name: 'Pominięte.txt', data: skipped.map((item) => `${item.name} — ${item.reason}`).join('\r\n') });
  }
  const blob = await createZipBlob(entries);
  const range = from || to ? `${from || 'poczatek'}_${to || 'dzis'}` : 'wszystkie';
  return { blob, fileName: `wawis-protokoly-${range}.zip`, added, skipped };
}

/** Pełne dane montażu do PDF szczelności z listy (numery seryjne itd.). Błąd → dane z listy. */
export async function loadJobForLeakPdf({ supabase, row }) {
  try {
    const jobs = await fetchJobs(supabase, [row.job_id]);
    const job = jobs.get(String(row.job_id));
    if (job) return job;
  } catch { /* poniżej dane z listy */ }
  return null;
}
