// WAWIS 14.17 — codzienne odświeżenie kolejki SMS przez zadanie bazy (pg_cron) i powiadomienie administratora.
//
// Zadanie private.run_sms_queue_daily_v1417() (migracja 20261103140000) tworzy raz dziennie wpis z jednorazowym
// kodem i wywołuje tę funkcję. Funkcja przyjmuje zadanie wyłącznie po potwierdzeniu kodu w bazie
// (claim_sms_queue_daily_run_v1417, tylko service_role) — bez sesji administratora i bez nowych sekretów.
// Po odświeżeniu liczy grupy SMS czekające na zatwierdzenie tak jak ekran SMS (wpis główny, grupa bez
// wysłanego SMS-a) i — gdy są — wysyła administratorowi powiadomienie push. Wysyłka SMS-ów bez zmian:
// nadal wyłącznie po zatwierdzeniu przez administratora.
//
// Bez importów npm: webpush i klient Supabase są przekazywane z index.ts (test node uruchamia ten plik wprost).

export const DAILY_EVENT_TYPE = "sms_queue_daily_v1417";

type RpcResult = { data: unknown; error: { message: string } | null };
// deno-lint-ignore no-explicit-any
type AdminClient = any;

export type DailyRunAuth =
  | { isDaily: false }
  | { isDaily: true; ok: false; status: number; error: string }
  | { isDaily: true; ok: true; runId: string; token: string; adminId: string };

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function authorizeDailyRun(adminClient: AdminClient, body: Record<string, unknown> | null): Promise<DailyRunAuth> {
  if (!body || body.eventType !== DAILY_EVENT_TYPE) return { isDaily: false };
  const runId = String(body.runId || "").trim();
  const token = String(body.token || "").trim();
  if (!isUuid(runId) || !/^[0-9a-f]{64}$/i.test(token)) {
    return { isDaily: true, ok: false, status: 403, error: "Zadanie nieautoryzowane." };
  }
  const claimed: RpcResult = await adminClient.rpc("claim_sms_queue_daily_run_v1417", { p_run_id: runId, p_token: token });
  if (claimed.error) return { isDaily: true, ok: false, status: 503, error: "Nie udało się potwierdzić zadania." };
  if (claimed.data !== true) return { isDaily: true, ok: false, status: 403, error: "Zadanie nieautoryzowane lub już wykonane." };

  const { data: admins, error: adminsError } = await adminClient
    .from("profiles").select("id, role, created_at").in("role", ["Administrator", "admin"])
    .order("created_at", { ascending: true }).limit(1);
  const adminId = String((Array.isArray(admins) ? admins[0]?.id : "") || "");
  if (adminsError || !adminId) return { isDaily: true, ok: false, status: 503, error: "Brak profilu administratora." };
  return { isDaily: true, ok: true, runId, token, adminId };
}

function pendingMessage(count: number) {
  const word = count === 1 ? "SMS czeka" : count >= 2 && count <= 4 ? "SMS-y czekają" : "SMS-ów czeka";
  return `${count} ${word} na zatwierdzenie. Otwórz moduł SMS na komputerze.`;
}

export async function finishDailyRun({
  adminClient, run, summary, webpush, vapid, receiptEndpoint,
}: {
  adminClient: AdminClient;
  run: { runId: string; token: string };
  summary: Record<string, unknown>;
  // deno-lint-ignore no-explicit-any
  webpush: any;
  vapid: { publicKey: string; privateKey: string; subject: string };
  receiptEndpoint: string;
}) {
  const result: Record<string, unknown> = { ...summary, pending: null, pushDelivered: 0 };
  const counted: RpcResult = await adminClient.rpc("count_pending_sms_groups_v1417", {});
  if (counted.error) {
    result.pushError = "Nie udało się policzyć SMS-ów czekających na zatwierdzenie.";
  } else {
    const pending = Math.max(0, Number(counted.data) || 0);
    result.pending = pending;
    if (pending > 0) {
      if (!vapid.publicKey || !vapid.privateKey) {
        result.pushError = "Brak konfiguracji PUSH.";
      } else {
        const push = await sendPendingPushToAdmins({ adminClient, webpush, vapid, receiptEndpoint, runId: run.runId, pending });
        result.pushDelivered = push.delivered;
        if (push.error) result.pushError = push.error;
      }
    }
  }
  const finished: RpcResult = await adminClient.rpc("finish_sms_queue_daily_run_v1417", {
    p_run_id: run.runId, p_token: run.token, p_result: result,
  });
  if (finished.error) result.finishError = finished.error.message;
  return result;
}

async function sendPendingPushToAdmins({
  adminClient, webpush, vapid, receiptEndpoint, runId, pending,
}: {
  adminClient: AdminClient;
  // deno-lint-ignore no-explicit-any
  webpush: any;
  vapid: { publicKey: string; privateKey: string; subject: string };
  receiptEndpoint: string;
  runId: string;
  pending: number;
}): Promise<{ delivered: number; error?: string }> {
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
  const deliveryLogType = "sms_queue_pending";
  const eventKey = `sms_queue_daily:${runId}`;
  let delivered = 0;

  for (const subscription of subscriptions) {
    // Jedno powiadomienie na subskrypcję na dzienne zadanie — także przy ponowieniu po błędzie.
    const claim: RpcResult = await adminClient.rpc("push_claim_delivery_v1268", {
      p_subscription_id: subscription.id, p_recipient_user_id: subscription.user_id, p_event_key: eventKey,
    });
    if (claim.error || claim.data !== true) continue;

    const attempt = await createDeliveryAttempt(adminClient, { user_id: subscription.user_id, job_id: null, type: deliveryLogType });
    const payload = JSON.stringify({
      type: deliveryLogType,
      jobId: null,
      title: "SMS-y do zatwierdzenia",
      body: pendingMessage(pending),
      url: "/",
      tag: `sms-queue-pending-${runId}`,
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
