function getFunctionFailureMessage(data) {
  const direct = String(data?.error || '').trim();
  if (direct) return direct;

  const failures = Array.isArray(data?.failures) ? data.failures : [];
  const messages = [...new Set(
    failures
      .map((item) => String(item?.error || '').trim())
      .filter(Boolean),
  )];

  if (messages.length) return messages.join(' | ');
  return 'Operacja SMS nie została wykonana.';
}

async function getInvokeErrorMessage(error) {
  const fallback = String(error?.message || '').trim();

  const response = error?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const payload = await response.clone().json();
      const direct = String(payload?.error || '').trim();
      if (direct) return direct;

      const failures = Array.isArray(payload?.failures) ? payload.failures : [];
      const messages = [...new Set(
        failures
          .map((item) => String(item?.error || '').trim())
          .filter(Boolean),
      )];
      if (messages.length) return messages.join(' | ');
    } catch {
      // Supabase czasem nie udostępnia treści odpowiedzi jako JSON.
    }
  }

  return fallback || 'Operacja SMS nie została wykonana.';
}

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

  if (error) throw new Error(await getInvokeErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  if (data?.ok === false) throw new Error(getFunctionFailureMessage(data));
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

  const result = await invokeWithFreshSession(supabase, 'send-service-sms', {
    mode: 'approval',
    logIds,
  });
  return requireSentMessages(result);
}

export async function retryNotSentSmsLogs({ supabase, logIds }) {
  if (!Array.isArray(logIds) || logIds.length === 0) {
    throw new Error('Nie wybrano niewysłanych SMS-ów do ponownej wysyłki.');
  }

  const result = await invokeWithFreshSession(supabase, 'send-service-sms', {
    mode: 'retry_not_sent',
    logIds,
  });
  return requireSentMessages(result);
}

function requireSentMessages(result) {
  if (!Number.isInteger(result?.sentCount) || result.sentCount <= 0) {
    throw new Error('Nie wysłano żadnej wiadomości. Odśwież listę i sprawdź aktualny status SMS.');
  }
  return result;
}

export async function sendUnsentSmsLog({ supabase, log }) {
  if (!log?.id) throw new Error('Brak identyfikatora niewysłanego SMS-a.');
  const status = String(log.status || '').trim().toLowerCase();
  if (status === 'pending_approval') {
    return approveAndSendSmsLogs({ supabase, logIds: [log.id] });
  }
  if (status === 'not_sent' || status === 'error') {
    return retryNotSentSmsLogs({ supabase, logIds: [log.id] });
  }
  throw new Error('Ten SMS nie jest dostępny do wysłania. Odśwież listę i sprawdź jego status.');
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


export async function sendTestSms({ supabase, phone }) {
  const testPhone = String(phone || '').trim();
  if (!testPhone) throw new Error('Podaj numer telefonu do testu SMS.');
  return invokeWithFreshSession(supabase, 'send-service-sms', {
    mode: 'test',
    testPhone,
  });
}
