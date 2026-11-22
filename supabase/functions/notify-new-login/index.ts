// WAWIS 14.76 — PUSH do administratorów o nowym logowaniu (nowa sesja w auth.sessions).
// Wywołuje wyłącznie zadanie bazy (private.run_login_notify_v1476) z jednorazowym kodem; funkcja przyjmuje
// zadanie tylko po potwierdzeniu kodu w bazie (claim_login_notices_v1476, tylko service_role).
// Bez nowych sekretów. Jedno powiadomienie na logowanie i subskrypcję (push_claim_delivery_v1268).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { buildLoginNoticePush, type LoginNotice, parseLoginNoticeRun } from "./notice.ts";

const DELIVERY_LOG_TYPE = "login_notice";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Dozwolone tylko POST." }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Brak konfiguracji." }, 500);

    const run = parseLoginNoticeRun(await request.json().catch(() => null));
    if (!run) return json({ error: "Zadanie nieautoryzowane." }, 403);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const claimed = await adminClient.rpc("claim_login_notices_v1476", { p_run_id: run.runId, p_token: run.token });
    if (claimed.error) return json({ error: "Nie udało się potwierdzić zadania." }, 503);
    if (!Array.isArray(claimed.data)) return json({ error: "Zadanie nieautoryzowane lub już wykonane." }, 403);
    const notices = claimed.data as LoginNotice[];

    const result: Record<string, unknown> = { notices: notices.length, delivered: 0 };
    if (notices.length) {
      const vapid = {
        publicKey: Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY") || "",
        privateKey: Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") || "",
        subject: Deno.env.get("WEB_PUSH_VAPID_SUBJECT") || "mailto:admin@example.com",
      };
      if (!vapid.publicKey || !vapid.privateKey) {
        result.error = "Brak konfiguracji PUSH.";
      } else {
        const receiptEndpoint = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/push-delivery-receipt`;
        const push = await sendToAdmins({ adminClient, vapid, receiptEndpoint, notices });
        result.delivered = push.delivered;
        if (push.error) result.error = push.error;
      }
    }
    await adminClient.rpc("finish_login_notify_run_v1476", { p_run_id: run.runId, p_token: run.token, p_result: result });
    return json({ ok: true, ...result });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function sendToAdmins({ adminClient, vapid, receiptEndpoint, notices }: { adminClient: any; vapid: { publicKey: string; privateKey: string; subject: string }; receiptEndpoint: string; notices: LoginNotice[] }): Promise<{ delivered: number; error?: string }> {
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
  for (const notice of notices) {
    const content = buildLoginNoticePush(notice);
    for (const subscription of subscriptions) {
      const claim = await adminClient.rpc("push_claim_delivery_v1268", {
        p_subscription_id: subscription.id, p_recipient_user_id: subscription.user_id, p_event_key: `login_notice:${notice.sessionId}`,
      });
      if (claim.error || claim.data !== true) continue;

      const attempt = await createDeliveryAttempt(adminClient, { user_id: subscription.user_id, job_id: null, type: DELIVERY_LOG_TYPE });
      const payload = JSON.stringify({
        type: DELIVERY_LOG_TYPE,
        jobId: null,
        title: content.title,
        body: content.body,
        url: "/",
        tag: content.tag,
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
  }
  return { delivered };
}

// deno-lint-ignore no-explicit-any
async function createDeliveryAttempt(adminClient: any, row: Record<string, unknown>) {
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
