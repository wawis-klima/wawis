function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (value[key] !== undefined) result[key] = canonicalize(value[key]);
        return result;
      }, {});
  }
  return value ?? null;
}

function fallbackUuid() {
  const bytes = new Uint8Array(16);
  const cryptoApi = globalThis?.crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createJobOperationId() {
  return globalThis?.crypto?.randomUUID?.() || fallbackUuid();
}

export function getJobCreatePayloadFingerprint(payload = {}) {
  return JSON.stringify(canonicalize(payload));
}

function normalizeOperationId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error('Nieprawidłowy identyfikator operacji tworzenia montażu.');
  }
  return normalized;
}

function shouldReconcileCreateError(error) {
  const code = String(error?.code || '').trim();
  if (code === '23505') return true;
  const message = String(error?.message || error || '').toLowerCase();
  return /failed to fetch|network|timeout|timed out|connection|fetch failed|abort/.test(message);
}

function buildReconciliationSelect(selectFields) {
  const fields = String(selectFields || 'id')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!fields.includes('id')) fields.unshift('id');
  if (!fields.includes('create_payload_fingerprint')) fields.push('create_payload_fingerprint');
  return fields.join(', ');
}

export async function insertJobIdempotently({
  supabase,
  payload,
  operationId,
  selectFields = 'id',
}) {
  if (!supabase) throw new Error('Brak połączenia z bazą.');
  const normalizedOperationId = normalizeOperationId(operationId || createJobOperationId());
  const fingerprint = getJobCreatePayloadFingerprint(payload);
  const insertPayload = {
    ...payload,
    create_operation_id: normalizedOperationId,
    create_payload_fingerprint: fingerprint,
  };

  let data = null;
  let insertError = null;
  try {
    const result = await supabase
      .from('jobs')
      .insert(insertPayload)
      .select(selectFields)
      .single();
    data = result?.data ?? null;
    insertError = result?.error ?? null;
  } catch (error) {
    insertError = error;
  }

  const inserted = Array.isArray(data) ? data[0] : data;
  if (!insertError && inserted?.id) {
    return { ...inserted, create_operation_id: normalizedOperationId, idempotent_replay: false };
  }

  if (!shouldReconcileCreateError(insertError)) {
    if (insertError) throw insertError;
    throw new Error('Baza nie zwróciła identyfikatora zapisanego montażu.');
  }

  let replay = null;
  let lookupError = null;
  try {
    const result = await supabase
      .from('jobs')
      .select(buildReconciliationSelect(selectFields))
      .eq('create_operation_id', normalizedOperationId)
      .maybeSingle();
    replay = result?.data ?? null;
    lookupError = result?.error ?? null;
  } catch (error) {
    lookupError = error;
  }

  if (replay?.id) {
    if (String(replay.create_payload_fingerprint || '') !== fingerprint) {
      const conflict = new Error('Konflikt idempotencji: ten identyfikator operacji został już użyty dla innego montażu.');
      conflict.code = 'JOB_CREATE_IDEMPOTENCY_CONFLICT';
      throw conflict;
    }
    return { ...replay, create_operation_id: normalizedOperationId, idempotent_replay: true };
  }

  if (insertError) throw insertError;
  if (lookupError) throw lookupError;
  throw new Error('Nie udało się potwierdzić wyniku tworzenia montażu.');
}
