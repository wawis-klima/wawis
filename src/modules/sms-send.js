async function invokeWithFreshSession(supabase, functionName, body) {
  if (!supabase) throw new Error('Brak połączenia z Supabase.');

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message || 'Nie udało się pobrać sesji użytkownika.');
  }

  if (!session?.access_token) {
    throw new Error('Brak aktywnej sesji użytkownika. Wyloguj się i zaloguj ponownie.');
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function sendManualServiceSms({ supabase, jobId, deviceId, reminderCycle, reminderDueDate }) {
  if (!jobId && !deviceId) throw new Error('Brak identyfikatora zlecenia lub urządzenia.');

  return invokeWithFreshSession(supabase, 'send-service-sms', {
    mode: 'manual',
    jobId,
    deviceId,
    reminderCycle,
    reminderDueDate,
  });
}

export async function approveAndSendSmsLogs({ supabase, logIds }) {
  if (!Array.isArray(logIds) || logIds.length === 0) {
    throw new Error('Nie wybrano SMS-ów do wysyłki.');
  }

  return invokeWithFreshSession(supabase, 'send-service-sms', {
    mode: 'approval',
    logIds,
  });
}

export async function generateServiceSmsQueue({ supabase }) {
  return invokeWithFreshSession(supabase, 'generate-service-sms-queue', {});
}

export async function deleteServiceSmsQueueItems({ supabase, rows }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Nie wybrano SMS-ów do usunięcia.');
  }

  return invokeWithFreshSession(supabase, 'send-service-sms', {
    mode: 'delete',
    rows,
  });
}
