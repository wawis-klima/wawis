const DELETE_OPERATION_STORAGE_PREFIX = 'wawis-job-delete-operation:';
const deleteOperationIds = new Map();

function createOperationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    const nibble = token === 'x' ? value : ((value & 0x3) | 0x8);
    return nibble.toString(16);
  });
}

function deleteOperationStorageKey(jobId) {
  return `${DELETE_OPERATION_STORAGE_PREFIX}${jobId}`;
}

function readStoredDeleteOperationId(jobId) {
  const inMemory = deleteOperationIds.get(jobId);
  if (inMemory) return inMemory;
  try {
    const stored = globalThis.sessionStorage?.getItem(deleteOperationStorageKey(jobId));
    if (stored) {
      deleteOperationIds.set(jobId, stored);
      return stored;
    }
  } catch {}
  return '';
}

function getOrCreateDeleteOperationId(jobId) {
  const existing = readStoredDeleteOperationId(jobId);
  if (existing) return existing;
  const operationId = createOperationId();
  deleteOperationIds.set(jobId, operationId);
  try {
    globalThis.sessionStorage?.setItem(deleteOperationStorageKey(jobId), operationId);
  } catch {}
  return operationId;
}

function clearDeleteOperationId(jobId) {
  deleteOperationIds.delete(jobId);
  try {
    globalThis.sessionStorage?.removeItem(deleteOperationStorageKey(jobId));
  } catch {}
}

export async function confirmDeleteJobRecord({ supabase, jobToDelete }) {
  if (!supabase || !jobToDelete) return;

  const jobId = String(jobToDelete.id || '').trim();
  if (!jobId) throw new Error('Brak identyfikatora karty do usunięcia.');

  const operationId = getOrCreateDeleteOperationId(jobId);
  const { data, error } = await supabase.rpc('admin_delete_job_idempotent', {
    p_job_id: jobId,
    p_operation_id: operationId,
  });
  if (error) throw error;

  const outcome = String(data?.outcome || '').trim();
  if (outcome === 'deleted' || outcome === 'already_applied') {
    clearDeleteOperationId(jobId);
    return {
      outcome,
      id: String(data?.id || jobId),
      operationId: String(data?.operation_id || operationId),
      deletedJobIds: [String(data?.id || jobId)],
    };
  }

  if (outcome === 'not_found') {
    clearDeleteOperationId(jobId);
    throw new Error('Karta nie istnieje albo została już usunięta inną operacją. Odśwież listę montaży.');
  }

  throw new Error('Nie udało się jednoznacznie potwierdzić usunięcia karty. Ponów operację.');
}

export async function updateJobStatus({ supabase, jobId, status, expectedStatus }) {
  if (!supabase || !jobId) return null;
  const { data, error } = await supabase.rpc('change_job_status_guarded', {
    p_job_id: jobId,
    p_expected_status: expectedStatus ?? null,
    p_new_status: status,
  });
  if (error) throw error;

  const outcome = String(data?.outcome || '').trim();
  if (outcome === 'changed' || outcome === 'already_applied') return data;

  if (outcome === 'not_found') {
    throw new Error('Montaż nie istnieje albo nie jest już dostępny. Odśwież dane.');
  }
  if (outcome === 'conflict') {
    const current = String(data?.current_status || '').trim();
    throw new Error(`Status montażu zmienił się w innej sesji${current ? ` na „${current}”` : ''}. Odśwież dane przed ponowną zmianą.`);
  }
  if (outcome === 'forbidden') {
    throw new Error('Brak uprawnień do zmiany statusu montażu.');
  }

  throw new Error('Nie udało się jednoznacznie potwierdzić zmiany statusu. Odśwież dane.');
}

export async function saveVatInvoiceStatus({ supabase, jobId, issued }) {
  if (!supabase || !jobId) return null;
  const { data, error } = await supabase.rpc('admin_set_job_vat_invoice_issued', {
    p_job_id: jobId,
    p_issued: Boolean(issued),
  });
  if (error) throw error;
  return data || { id: jobId, vat_invoice_issued: Boolean(issued) };
}

export async function confirmVatInvoiceFromFakturownia({ supabase, jobId, invoiceId, invoiceNumber = '' }) {
  if (!supabase || !jobId || !invoiceId) return null;
  const { data, error } = await supabase.rpc('admin_confirm_job_vat_invoice_fakturownia', {
    p_job_id: jobId,
    p_invoice_id: String(invoiceId),
    p_invoice_number: String(invoiceNumber || '').trim() || null,
  });
  if (error) throw error;
  return data || {
    id: jobId,
    vat_invoice_issued: true,
    vat_invoice_fakturownia_confirmed: true,
    vat_invoice_fakturownia_invoice_id: String(invoiceId),
    vat_invoice_fakturownia_invoice_number: String(invoiceNumber || '').trim() || null,
  };
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
