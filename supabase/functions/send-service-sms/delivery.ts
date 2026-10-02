export class SmsDeliveryBlockedError extends Error {
  constructor() {
    super('Ten SMS został już wysłany lub zarezerwowany do wysyłki dla tej grupy klienta. Jeśli poprzednia próba została przerwana, sprawdź jej wynik w SMSAPI przed kolejną wysyłką.');
    this.name = 'SmsDeliveryBlockedError';
  }
}

type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

type ClaimResult = {
  claim_id?: string | null;
  reminder_group_id?: string | null;
};

// A reservation is deliberately never released after an uncertain network result.
// Releasing it on timeout could send a second message already accepted by SMSAPI.
export async function sendServiceSmsOnce<T extends { providerMessageId: string | null }>({
  adminClient,
  phone,
  dueDate,
  jobId = null,
  deviceId = null,
  cycle,
  send,
}: {
  adminClient: RpcClient;
  phone: string;
  dueDate: string;
  jobId?: string | null;
  deviceId?: string | null;
  cycle: number;
  send: () => Promise<T>;
}): Promise<T & { reminderGroupId: string }> {
  const claim = await adminClient.rpc('claim_service_sms_group', {
    p_phone: phone,
    p_due_date: dueDate,
    p_job_id: jobId,
    p_device_id: deviceId,
    p_cycle: cycle,
  });

  if (claim.error) throw new Error(claim.error.message);
  if (!claim.data) throw new SmsDeliveryBlockedError();

  const claimData = (typeof claim.data === 'object' && claim.data !== null ? claim.data : {}) as ClaimResult;
  const claimId = String(claimData.claim_id || '').trim();
  const reminderGroupId = String(claimData.reminder_group_id || '').trim();
  if (!claimId || !reminderGroupId) {
    throw new Error('Nie udało się potwierdzić rezerwacji grupy SMS.');
  }

  let result: T;
  try {
    result = await send();
  } catch (error) {
    const uncertain = new Error(
      `Nie potwierdzono wyniku wysyłki. Ponowna wysyłka dla tej grupy została zablokowana; sprawdź wynik w SMSAPI. ${error instanceof Error ? error.message : String(error)}`,
    ) as Error & { reminderGroupId?: string };
    uncertain.reminderGroupId = reminderGroupId;
    throw uncertain;
  }

  const confirmed = await adminClient.rpc('confirm_service_sms', {
    p_claim_id: claimId,
    p_provider_message_id: result.providerMessageId,
  });
  if (confirmed.error) {
    console.error('SMS accepted; group reservation retained, confirmation recording failed:', confirmed.error.message);
  }

  return Object.assign(result, { reminderGroupId });
}
