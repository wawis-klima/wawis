import { supabaseAnonKey, supabaseUrl } from "../lib/supabase.js";

export function getAssignedUserIdsFromForm(form) {
  const ids = [form?.main_technician_id, ...(form?.viewers || [])].filter(Boolean);
  return [...new Set(ids)];
}

export function getAssignedUserIdsFromJob(job) {
  if (!job) return [];
  const ids = [job.main_technician_id, ...(job.viewers || []).map((viewer) => viewer.user_id)].filter(Boolean);
  return [...new Set(ids)];
}

export function getLocalDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isInstallationDateInPast(installationDate, today = new Date()) {
  const rawValue = String(installationDate || '').trim();
  const dateMatch = rawValue.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return false;

  const todayKey = getLocalDateKey(today);
  if (!todayKey) return false;

  return dateMatch[1] < todayKey;
}

export function shouldSendAssignmentPushForInstallationDate(installationDate, today = new Date()) {
  return !isInstallationDateInPast(installationDate, today);
}


export async function sendAssignmentPush({ supabase, newUserIds, jobId }) {
  if (!supabase || !jobId || !newUserIds?.length || !supabaseUrl || !supabaseAnonKey) return;

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;

    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error('Brak sesji administratora do wywołania push.');

    const response = await fetch(`${supabaseUrl}/functions/v1/send-assignment-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({
        jobId,
        assignedUserIds: [...new Set(newUserIds.filter(Boolean))],
        triggeredBy: 'assignment',
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Push o przypisaniu zwrócił błąd HTTP.', {
        status: response.status,
        statusText: response.statusText,
        payload,
      });
      const error = new Error(payload?.error || payload?.message || response.statusText || 'Nie udało się wywołać funkcji push.');
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    console.info('Push o przypisaniu został wywołany.', payload);
  } catch (error) {
    console.error('Nie udało się wysłać push o przypisaniu:', error?.message || error);
    throw error;
  }
}


export async function sendJobCompletionPush({ supabase, jobId }) {
  if (!supabase || !jobId || !supabaseUrl || !supabaseAnonKey) return null;

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;

    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error('Brak aktywnej sesji do wysłania powiadomienia o zakończeniu.');

    const retryDelaysMs = [0, 700, 1400];
    let lastError = null;

    for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
      if (retryDelaysMs[attempt] > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/send-assignment-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          jobId,
          eventType: 'job_completed',
          triggeredBy: attempt === 0 ? 'status_completed' : `status_completed_retry_${attempt}`,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        console.info('Push o zakończeniu zlecenia został wywołany.', payload);
        return payload;
      }

      const error = new Error(payload?.error || payload?.message || response.statusText || 'Nie udało się wysłać powiadomienia o zakończeniu zlecenia.');
      error.status = response.status;
      error.payload = payload;
      lastError = error;

      console.error('Push o zakończeniu zlecenia zwrócił błąd HTTP.', {
        status: response.status,
        statusText: response.statusText,
        payload,
        attempt: attempt + 1,
      });

      // 409 jest jedynym błędem, który może wynikać z krótkiego opóźnienia
      // widoczności zmiany statusu. Innych błędów nie ponawiamy w ciemno.
      if (response.status !== 409 || payload?.retryable === false) {
        throw error;
      }
    }

    throw lastError || new Error('Nie udało się wysłać powiadomienia o zakończeniu zlecenia.');
  } catch (error) {
    console.error('Nie udało się wysłać push o zakończeniu zlecenia:', error?.message || error);
    throw error;
  }
}

export async function toggleJobViewer({
  supabase,
  jobId,
  userId,
  viewers,
  jobs = [],
  sendAssignmentPushFn,
}) {
  if (!supabase) return;

  const exists = viewers.some((viewer) => viewer.user_id === userId);
  if (exists) {
    const { error } = await supabase.from('job_access').delete().eq('job_id', jobId).eq('user_id', userId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('job_access').insert({ job_id: jobId, user_id: userId });
  if (error) throw error;

  const job = Array.isArray(jobs) ? jobs.find((item) => item?.id === jobId) : null;
  if (shouldSendAssignmentPushForInstallationDate(job?.installation_date)) {
    void sendAssignmentPushFn?.({ newUserIds: [userId], jobId }).catch((pushError) => {
      console.warn('Nie udało się wysłać push o przypisaniu, ale przypisanie montera zostało zapisane:', pushError?.message || pushError);
    });
  }
}
