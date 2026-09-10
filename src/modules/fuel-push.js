import { supabaseAnonKey, supabaseUrl } from '../lib/supabase.js';

export async function sendFuelEntryPush({ supabase, fuelEntryId }) {
  if (!supabase || !fuelEntryId || !supabaseUrl || !supabaseAnonKey) return null;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('Brak aktywnej sesji do wysłania powiadomienia o tankowaniu.');

  const response = await fetch(`${supabaseUrl}/functions/v1/send-fuel-entry-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({
      fuelEntryId,
      eventType: 'fuel_entry_created',
      triggeredBy: 'fuel_entry_created',
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || payload?.message || response.statusText || 'Nie udało się wysłać powiadomienia o tankowaniu.');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}
