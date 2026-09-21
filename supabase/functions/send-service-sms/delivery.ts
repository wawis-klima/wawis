export class SmsDeliveryBlockedError extends Error {
  constructor() {
    super('Ten SMS został już wysłany lub zarezerwowany do wysyłki. Jeśli poprzednia próba została przerwana, sprawdź jej wynik w SMSAPI przed kolejną wysyłką.');
    this.name = 'SmsDeliveryBlockedError';
  }
}

type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

// A reservation is deliberately never released after an uncertain network result.
// Releasing it on timeout could send a second message already accepted by SMSAPI.
export async function sendServiceSmsOnce<T extends { providerMessageId: string | null }>({
  adminClient, jobId = null, deviceId = null, cycle, send,
}: { adminClient: RpcClient; jobId?: string | null; deviceId?: string | null; cycle: number; send: () => Promise<T> }): Promise<T> {
  const claim = await adminClient.rpc('claim_service_sms', { p_job_id: jobId, p_device_id: deviceId, p_cycle: cycle });
  if (claim.error) throw new Error(claim.error.message);
  if (!claim.data) throw new SmsDeliveryBlockedError();
  let result: T;
  try {
    result = await send();
  } catch (error) {
    throw new Error(`Nie potwierdzono wyniku wysyłki. Ponowna wysyłka została zablokowana; sprawdź wynik w SMSAPI. ${error instanceof Error ? error.message : String(error)}`);
  }
  const confirmed = await adminClient.rpc('confirm_service_sms', { p_claim_id: claim.data, p_provider_message_id: result.providerMessageId });
  if (confirmed.error) console.error('SMS accepted; reservation retained, confirmation recording failed:', confirmed.error.message);
  return result;
}
