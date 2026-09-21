async function getFreshFunctionHeaders(supabase) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const accessToken = data?.session?.access_token;
  if (!accessToken) {
    throw new Error('Brak aktywnej sesji użytkownika. Wyloguj się i zaloguj ponownie.');
  }

  const supabaseUrl = supabase?.supabaseUrl || supabase?.auth?.url?.replace(/\/auth\/v1$/,'') || '';
  const supabaseKey = supabase?.supabaseKey || '';
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(supabaseKey ? { apikey: supabaseKey } : {}),
    'Content-Type': 'application/json',
  };
}

export async function sendManualServiceSms({ supabase, jobId }) {
  if (!supabase) throw new Error('Brak połączenia z Supabase.');
  if (!jobId) throw new Error('Brak identyfikatora zlecenia.');

  const headers = await getFreshFunctionHeaders(supabase);
  const { data, error } = await supabase.functions.invoke('send-service-sms', {
    headers,
    body: {
      mode: 'manual',
      jobId,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function approveAndSendSmsLogs({ supabase, logIds }) {
  if (!supabase) throw new Error('Brak połączenia z Supabase.');
  if (!Array.isArray(logIds) || logIds.length === 0) throw new Error('Nie wybrano SMS-ów do wysyłki.');

  const headers = await getFreshFunctionHeaders(supabase);
  const { data, error } = await supabase.functions.invoke('send-service-sms', {
    headers,
    body: {
      mode: 'approval',
      logIds,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function generateServiceSmsQueue({ supabase }) {
  if (!supabase) throw new Error('Brak połączenia z Supabase.');

  const headers = await getFreshFunctionHeaders(supabase);
  const { data, error } = await supabase.functions.invoke('generate-service-sms-queue', {
    headers,
    body: {},
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
