// WAWIS 14.20 — powiadomienie push do administratorów (wzorzec 14.17 daily-run.ts: jedno powiadomienie
// na subskrypcję i zdarzenie przez push_claim_delivery_v1268, potwierdzenia odbioru, wygaszanie martwych
// subskrypcji). Bez importów npm: webpush i klient Supabase przekazywane z index.ts.

type RpcResult = { data: unknown; error: { message: string } | null };
// deno-lint-ignore no-explicit-any
type AdminClient = any;

export async function sendAdminPush({
  adminClient, webpush, vapid, receiptEndpoint, eventKey, logType, title, body, tag, url,
}: {
  adminClient: AdminClient;
  // deno-lint-ignore no-explicit-any
  webpush: any;
  vapid: { publicKey: string; privateKey: string; subject: string };
  receiptEndpoint: string;
  eventKey: string;
  logType: string;
  title: string;
  body: string;
  tag: string;
  url: string;
}): Promise<{ delivered: number; error?: string }> {
  if (!vapid.publicKey || !vapid.privateKey) return { delivered: 0, error: "Brak konfiguracji PUSH." };
  const { data: admins, error: adminsError } = await adminClient
    .from("profiles").select("id").in("role", ["Administrator", "admin"]);
  if (adminsError) return { delivered: 0, error: "Nie udało się pobrać administratorów." };
  const userIds = [...new Set((admins || []).map((row: { id?: string }) => String(row.id || "")).filter(Boolean))];
  if (!userIds.length) return { delivered: 0, error: "Brak administratora." };

  const { data: subscriptions, error: subscriptionsError } = await adminClient
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, lifecycle_token, ownership_generation")
    .in("user_id", userIds).eq("is_active", true);
  if (subscriptionsError) return { delivered: 0, error: "Nie udało się pobrać subskrypcji PUSH." };
  if (!subscriptions?.length) return { delivered: 0, error: "Administrator nie ma aktywnych powiadomień PUSH." };

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  let delivered = 0;

  for (const subscription of subscriptions) {
    const claim: RpcResult = await adminClient.rpc("push_claim_delivery_v1268", {
      p_subscription_id: subscription.id, p_recipient_user_id: subscription.user_id, p_event_key: eventKey,
    });
    if (claim.error || claim.data !== true) continue;

    const attempt = await createDeliveryAttempt(adminClient, { user_id: subscription.user_id, job_id: null, type: logType });
    const payload = JSON.stringify({
      type: logType,
      jobId: null,
      title,
      body,
      url,
      tag,
      recipientUserId: String(subscription.user_id || ""),
      subscriptionGeneration: Number(subscription.ownership_generation || 0),
      deliveryReceipt: attempt && receiptEndpoint
        ? { deliveryLogId: attempt.id, receiptToken: attempt.token, endpoint: receiptEndpoint }
        : null,
    });
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload);
      delivered += 1;
      if (attempt?.id) await adminClient.from("push_delivery_log").update({ status: "sent", response_code: 201, error_message: null }).eq("id", attempt.id);
    } catch (error) {
      const statusCode = typeof (error as { statusCode?: number })?.statusCode === "number" ? (error as { statusCode: number }).statusCode : null;
      const status = statusCode === 404 || statusCode === 410 ? "expired" : "error";
      if (attempt?.id) {
        await adminClient.from("push_delivery_log").update({
          status, response_code: statusCode, error_message: error instanceof Error ? error.message : String(error),
        }).eq("id", attempt.id);
      }
      if (statusCode === 404 || statusCode === 410) {
        await adminClient.rpc("push_subscription_expire_atomic", {
          p_request_user_id: subscription.user_id,
          p_endpoint: subscription.endpoint,
          p_p256dh: subscription.p256dh,
          p_auth: subscription.auth,
          p_lifecycle_token: subscription.lifecycle_token || "",
          p_expected_generation: subscription.ownership_generation,
        });
      }
    }
  }
  return { delivered };
}

async function createDeliveryAttempt(adminClient: AdminClient, row: Record<string, unknown>) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const token = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const receiptTokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const { data, error } = await adminClient
    .from("push_delivery_log")
    .insert({ ...row, status: "sending", response_code: null, error_message: null, receipt_token_hash: receiptTokenHash })
    .select("id").single();
  if (error || !data?.id) return null;
  return { id: String(data.id), token };
}
