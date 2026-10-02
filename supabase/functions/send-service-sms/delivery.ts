export class SmsDeliveryBlockedError extends Error {
  reason: string;

  constructor(message = 'Ten SMS nie może zostać teraz wysłany.', reason = 'blocked') {
    super(message);
    this.name = 'SmsDeliveryBlockedError';
    this.reason = reason;
  }
}

type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

type PreparedSms = {
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
    default:
      return 'Dane przypomnienia zmieniły się albo wysyłka jest już zablokowana. Odśwież listę SMS.';
  }
}

// Rezerwacja jest celowo utrzymywana po niepewnym wyniku sieci.
// Zwolnienie jej po timeout mogłoby spowodować drugi SMS już przyjęty przez SMSAPI.
export async function sendServiceSmsOnce<T extends { providerMessageId: string | null }>({
  adminClient,
  logId = null,
  jobId = null,
  deviceId = null,
  cycle,
  send,
}: {
  adminClient: RpcClient;
  logId?: string | null;
  jobId?: string | null;
  deviceId?: string | null;
  cycle: number;
  send: (prepared: PreparedSms) => Promise<T>;
}): Promise<T & PreparedSms> {
  const claim = await adminClient.rpc('claim_service_sms_group_v2', {
    p_log_id: logId,
    p_job_id: jobId,
    p_device_id: deviceId,
    p_cycle: cycle,
  });

  if (claim.error) throw new Error(claim.error.message);

  const claimData = (typeof claim.data === 'object' && claim.data !== null ? claim.data : {}) as ClaimResult;
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

  let result: T;
  try {
    result = await send(prepared);
  } catch (error) {
    const uncertain = new Error(
      `Nie potwierdzono wyniku wysyłki. Ponowna wysyłka dla tej grupy została zablokowana; sprawdź wynik w SMSAPI. ${error instanceof Error ? error.message : String(error)}`,
    ) as Error & { reminderGroupId?: string };
    uncertain.reminderGroupId = prepared.reminderGroupId;
    throw uncertain;
  }

  const confirmed = await adminClient.rpc('confirm_service_sms', {
    p_claim_id: prepared.claimId,
    p_provider_message_id: result.providerMessageId,
  });
  if (confirmed.error) {
    console.error('SMS accepted; group reservation retained, confirmation recording failed:', confirmed.error.message);
  }

  return Object.assign(result, prepared);
}
