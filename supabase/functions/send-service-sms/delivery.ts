export class SmsDeliveryBlockedError extends Error {
  reason: string;

  constructor(message = 'Ten SMS nie może zostać teraz wysłany.', reason = 'blocked') {
    super(message);
    this.name = 'SmsDeliveryBlockedError';
    this.reason = reason;
  }
}

export class SmsProviderRejectedError extends Error {
  providerResponse: unknown;
  statusCode: number | null;
  claimReleased = false;

  constructor(message: string, providerResponse: unknown = null, statusCode: number | null = null) {
    super(message);
    this.name = 'SmsProviderRejectedError';
    this.providerResponse = providerResponse;
    this.statusCode = statusCode;
  }
}

export class SmsDeliveryUncertainError extends Error {
  claimId: string;
  preparedSms: PreparedSms;
  safeToRetry = false;

  constructor(message: string, claimId: string, preparedSms: PreparedSms) {
    super(message);
    this.name = 'SmsDeliveryUncertainError';
    this.claimId = claimId;
    this.preparedSms = preparedSms;
  }
}

export class SmsAcceptancePersistenceError extends Error {
  claimId: string;
  providerMessageId: string;
  preparedSms: PreparedSms;
  safeToRetry = false;

  constructor(message: string, claimId: string, providerMessageId: string, preparedSms: PreparedSms) {
    super(message);
    this.name = 'SmsAcceptancePersistenceError';
    this.claimId = claimId;
    this.providerMessageId = providerMessageId;
    this.preparedSms = preparedSms;
  }
}

type RpcResult = { data: unknown; error: { message: string } | null };
type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
};

export type PreparedSms = {
  claimId: string;
  reminderGroupId: string;
  recipientPhone: string;
  currentDueDate: string;
  windowEndDate: string;
  linkedJobId: string | null;
  deviceId: string | null;
  installationDate: string;
  client: string;
  cycle: number;
};

type ClaimResult = {
  ok?: boolean;
  reason?: string | null;
  message?: string | null;
  claim_id?: string | null;
  reminder_group_id?: string | null;
  recipient_phone?: string | null;
  current_due_date?: string | null;
  window_end_date?: string | null;
  linked_job_id?: string | null;
  device_id?: string | null;
  installation_date?: string | null;
  client?: string | null;
  cycle?: number | string | null;
};

type StageResult = {
  ok?: boolean;
  reason?: string | null;
};

type AcceptanceResult = {
  ok?: boolean;
  reason?: string | null;
  log_id?: string | null;
};

type SendPlan<T> = {
  message: string;
  send: () => Promise<T>;
};

function getBlockedMessage(claim: ClaimResult) {
  if (claim.message) return String(claim.message);
  switch (String(claim.reason || 'blocked')) {
    case 'sms_disabled':
      return 'Zgoda SMS lub przypomnienia zostały wyłączone. Wiadomość nie została wysłana.';
    case 'invalid_current_phone':
      return 'Aktualny numer telefonu klienta jest nieprawidłowy. Wiadomość nie została wysłana.';
    case 'outside_active_window':
      return 'Termin tego przypomnienia nie jest już w aktywnym 62-dniowym oknie wysyłki.';
    case 'missing_linked_job_consent':
      return 'Brak pewnego powiązania urządzenia z kartą klienta i zgodą SMS. Wiadomość nie została wysłana.';
    case 'group_already_sent':
      return 'SMS dla tej grupy klienta został już wysłany.';
    case 'group_already_has_primary':
      return 'Ta pozycja została zastąpiona aktualną pozycją przypomnienia klienta. Odśwież listę SMS.';
    case 'group_claim_exists':
      return 'Ten SMS jest już zarezerwowany do wysyłki dla tej grupy klienta.';
    case 'retry_claim_exists':
      return 'Ponowienie tego SMS-a jest już w toku albo zostało już wykonane.';
    case 'log_not_retryable':
      return 'Ten wpis nie ma już statusu NIEWYSŁANO i nie może być ponowiony.';
    case 'missing_current_source':
      return 'Nie można potwierdzić aktualnych danych klienta dla tego starego wpisu.';
    default:
      return 'Dane przypomnienia zmieniły się albo wysyłka jest już zablokowana. Odśwież listę SMS.';
  }
}

function asObject(value: unknown) {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

async function markUncertain(adminClient: RpcClient, claimId: string, message: string) {
  try {
    const result = await adminClient.rpc('mark_service_sms_claim_uncertain', {
      p_claim_id: claimId,
      p_error: message,
    });
    if (result.error) console.error('mark_service_sms_claim_uncertain failed:', result.error.message);
  } catch (error) {
    console.error('mark_service_sms_claim_uncertain threw:', error);
  }
}

// Etap 4:
// 1) claim oparty na aktualnym stanie,
// 2) staging danych PRZED połączeniem z SMSAPI,
// 3) wysyłka z provider-level idx,
// 4) atomowe utrwalenie akceptacji po odpowiedzi operatora.
// Przy wyniku niepewnym claim pozostaje zablokowany, żeby nie wysłać duplikatu.
export async function sendServiceSmsOnce<T extends { providerMessageId: string | null; responseBody?: unknown }>({
  adminClient,
  actorId,
  logId = null,
  jobId = null,
  deviceId = null,
  cycle,
  retryLogId = null,
  prepare,
}: {
  adminClient: RpcClient;
  actorId: string;
  logId?: string | null;
  jobId?: string | null;
  deviceId?: string | null;
  cycle: number;
  retryLogId?: string | null;
  prepare: (prepared: PreparedSms) => SendPlan<T>;
}): Promise<T & PreparedSms & { logId: string | null }> {
  const claim = retryLogId
    ? await adminClient.rpc('claim_service_sms_not_sent_retry', {
        p_log_id: retryLogId,
      })
    : await adminClient.rpc('claim_service_sms_group_v2', {
        p_log_id: logId,
        p_job_id: jobId,
        p_device_id: deviceId,
        p_cycle: cycle,
      });

  if (claim.error) throw new Error(claim.error.message);

  const claimData = asObject(claim.data) as ClaimResult;
  if (claimData.ok !== true) {
    throw new SmsDeliveryBlockedError(getBlockedMessage(claimData), String(claimData.reason || 'blocked'));
  }

  const prepared: PreparedSms = {
    claimId: String(claimData.claim_id || '').trim(),
    reminderGroupId: String(claimData.reminder_group_id || '').trim(),
    recipientPhone: String(claimData.recipient_phone || '').trim(),
    currentDueDate: String(claimData.current_due_date || '').trim(),
    windowEndDate: String(claimData.window_end_date || '').trim(),
    linkedJobId: String(claimData.linked_job_id || '').trim() || null,
    deviceId: String(claimData.device_id || '').trim() || null,
    installationDate: String(claimData.installation_date || '').trim(),
    client: String(claimData.client || 'Kliencie').trim() || 'Kliencie',
    cycle: Number.parseInt(String(claimData.cycle ?? cycle), 10) || cycle,
  };

  if (!prepared.claimId || !prepared.reminderGroupId || !prepared.recipientPhone || !prepared.currentDueDate) {
    throw new Error('Baza nie zwróciła kompletnych aktualnych danych do wysyłki SMS.');
  }

  const plan = prepare(prepared);
  const message = String(plan?.message || '').trim();
  if (!message || typeof plan?.send !== 'function') {
    throw new Error('Nie udało się przygotować wiadomości SMS przed wysyłką.');
  }

  const staged = await adminClient.rpc('stage_service_sms_claim', {
    p_claim_id: prepared.claimId,
    p_message: message,
    p_actor_id: actorId,
  });

  if (staged.error) throw new Error(staged.error.message);
  const stagedData = asObject(staged.data) as StageResult;
  if (stagedData.ok !== true) {
    throw new Error(`Nie udało się przygotować bezpiecznej wysyłki SMS: ${String(stagedData.reason || 'stage_failed')}`);
  }

  let result: T;
  try {
    result = await plan.send();
  } catch (error) {
    if (error instanceof SmsProviderRejectedError) {
      const rejected = await adminClient.rpc('reject_service_sms_claim', {
        p_claim_id: prepared.claimId,
        p_error: error.message,
        p_provider_response: error.providerResponse ?? null,
      });

      if (!rejected.error && asObject(rejected.data).ok === true) {
        error.claimReleased = true;
      } else {
        console.error('reject_service_sms_claim failed:', rejected.error?.message || rejected.data);
      }
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    await markUncertain(adminClient, prepared.claimId, errorMessage);
    throw new SmsDeliveryUncertainError(
      `Nie potwierdzono wyniku wysyłki SMS. Nie wysyłaj ponownie tej pozycji ręcznie — claim pozostaje zablokowany, a callback SMSAPI może dokończyć zapis. ${errorMessage}`,
      prepared.claimId,
      prepared,
    );
  }

  const providerMessageId = String(result?.providerMessageId || '').trim();
  if (!providerMessageId) {
    const messageWithoutId = 'SMSAPI nie zwróciło identyfikatora przyjętej wiadomości.';
    await markUncertain(adminClient, prepared.claimId, messageWithoutId);
    throw new SmsDeliveryUncertainError(
      `${messageWithoutId} Nie wysyłaj ponownie tej pozycji ręcznie.`,
      prepared.claimId,
      prepared,
    );
  }

  const accepted = await adminClient.rpc('record_service_sms_acceptance', {
    p_claim_id: prepared.claimId,
    p_provider_message_id: providerMessageId,
    p_provider_response: result.responseBody ?? null,
  });

  const acceptedData = asObject(accepted.data) as AcceptanceResult;
  if (accepted.error || acceptedData.ok !== true) {
    const reason = accepted.error?.message || String(acceptedData.reason || 'acceptance_persistence_failed');
    await markUncertain(adminClient, prepared.claimId, `SMSAPI przyjęło wiadomość ${providerMessageId}, ale zapis akceptacji nie został potwierdzony: ${reason}`);
    throw new SmsAcceptancePersistenceError(
      `SMSAPI przyjęło wiadomość, ale nie udało się potwierdzić pełnego zapisu w bazie. Nie wysyłaj jej ponownie — webhook może odzyskać wpis po claim/idx. ${reason}`,
      prepared.claimId,
      providerMessageId,
      prepared,
    );
  }

  return Object.assign(result, prepared, {
    logId: String(acceptedData.log_id || '').trim() || null,
  });
}
