import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import webpush from "npm:web-push@3.6.7";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type",
};
Deno.serve(async (request:Request)=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(request.method!=="POST")return json({error:"Method not allowed"},405);
  try {
    const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
    const serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
    const vapidPublicKey=Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY")||"";
    const vapidPrivateKey=Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY")||"";
    const vapidSubject=Deno.env.get("WEB_PUSH_VAPID_SUBJECT")||"mailto:biuro@wawis.pl";
    if(!supabaseUrl||!serviceRoleKey||!vapidPublicKey||!vapidPrivateKey)
      return json({error:"Brak konfiguracji PUSH."},500);
    const payload=await request.json();
    const eventId=String(payload?.eventId||"").trim();
    const token=String(payload?.token||"").trim();
    if(payload?.eventType!=="service_visit_completed_webhook"
      || !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(eventId)
      || !/^[0-9a-f]{64}$/i.test(token))
      return json({error:"Zdarzenie nieautoryzowane."},403);
    const adminClient=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:verified,error:verifyError}=await adminClient.rpc("get_service_visit_completed_push_event_v1389",{
      p_event_id:eventId,p_token:token,
    });
    if(verifyError)return json({error:"Nie zweryfikowano zdarzenia."},503);
    const event=Array.isArray(verified)?verified[0]:null;
    if(!event?.visit_id||!event?.protocol_id)return json({error:"Nieznane albo obsłużone zdarzenie."},403);
    const [{data:visit,error:visitError},{data:admins,error:adminsError},{data:actor}] =await Promise.all([
      adminClient.from("service_visits").select("id,contractor_id,status,client:contractors(company_name,contact_person,city,street)")
        .eq("id",event.visit_id).maybeSingle(),
      adminClient.from("profiles").select("id").eq("role","Administrator"),
      adminClient.from("profiles").select("full_name").eq("id",event.actor_id).maybeSingle(),
    ]);
    if(visitError||!visit||visit.status!=="wykonany"||adminsError)
      return json({error:"Nie można zweryfikować wizyty."},503);
    const adminsIds=[...new Set((admins||[]).map((p:any)=>String(p.id||"")).filter(Boolean))];
    const client=Array.isArray(visit.client)?visit.client[0]:visit.client;
    const title="Przegląd zakończony";
    const body=[
      String(client?.company_name||client?.contact_person||"Klient"),
      String(actor?.full_name||"Administrator"),
      [client?.street,client?.city].filter(Boolean).join(", "),
    ].filter(Boolean).join(" • ");
    const response=await sendPushToUsers({
      adminClient,userIds:adminsIds,job:null,
      deliveryType:"service_visit_completed",
      eventKey:"service_visit_completed:"+event.visit_id,
      deliveryLogType:"service_visit_completed:"+event.visit_id,
      title,body,tag:"service-visit-completed-"+event.visit_id,
      targetUrl:"/",
      vapidPublicKey,vapidPrivateKey,vapidSubject,
    });
    const result=await response.clone().json().catch(()=>({}));
    const alreadyClaimed=Array.isArray(result.results)&&result.results.length>0
      &&result.results.every((item:any)=>item.ok||item.reason==="duplicate_or_inactive");
    if(response.ok && (Number(result.delivered||0)>0 || alreadyClaimed || adminsIds.length===0)){
      await adminClient.rpc("mark_service_visit_completed_push_event_v1389",{p_event_id:eventId,p_token:token});
    }
    return response;
  }catch(error){
    console.error("service_visit_completed_push",error instanceof Error?error.message:String(error));
    return json({error:"Błąd wysyłania powiadomienia serwisowego."},500);
  }
});

async function sendPushToUsers({
  adminClient,
  userIds,
  job,
  deliveryType,
  eventKey = "",
  deliveryLogType = deliveryType,
  title,
  body,
  tag,
  targetUrl = "",
  subscriptionEndpoint = "",
  vapidPublicKey,
  vapidPrivateKey,
  vapidSubject,
}: any) {
  const uniqueUserIds = [...new Set((userIds || []).filter(Boolean))];
  if (!uniqueUserIds.length) {
    return json({ ok: true, delivered: 0, skipped: 0, reason: "Brak odbiorców." });
  }

  let subscriptionsQuery = adminClient
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, lifecycle_token, ownership_generation")
    .in("user_id", uniqueUserIds)
    .eq("is_active", true);

  if (subscriptionEndpoint) {
    subscriptionsQuery = subscriptionsQuery.eq("endpoint", subscriptionEndpoint);
  }

  const { data: subscriptions, error: subscriptionsError } = await subscriptionsQuery;

  if (subscriptionsError) {
    return json({ error: subscriptionsError.message }, 500);
  }

  const subscribedUsers = new Set((subscriptions || []).map((row: any) => String(row.user_id || "")));
  const usersWithoutSubscription = uniqueUserIds.filter((userId) => !subscribedUsers.has(String(userId)));

  if (usersWithoutSubscription.length) {
    await insertDeliveryRows(adminClient, usersWithoutSubscription.map((userId) => ({
      user_id: userId,
      job_id: job?.id || null,
      type: deliveryLogType,
      status: "skipped",
      response_code: null,
      error_message: "Brak aktywnej subskrypcji push.",
    })));
  }

  if (!subscriptions?.length) {
    return json({ ok: true, delivered: 0, skipped: uniqueUserIds.length, reason: "Brak aktywnych subskrypcji." });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const notificationBody = String(body || "").trim()
    || (deliveryType === "push_test"
      ? "Powiadomienia PUSH działają."
      : "Masz nowe zdarzenie w aplikacji Wawis.");

  const receiptEndpoint = `${Deno.env.get("SUPABASE_URL") || ""}/functions/v1/push-delivery-receipt`;

  const results = await Promise.all(subscriptions.map(async (subscription: any) => {
    if (eventKey) {
      const { data: claimed, error: claimError } = await adminClient.rpc("push_claim_delivery_v1268", {
        p_subscription_id: subscription.id,
        p_recipient_user_id: subscription.user_id,
        p_event_key: eventKey,
      });
      if (claimError) {
        // Never send if the atomic claim is uncertain.
        return { ok: false, skipped: false, subscriptionId: subscription.id, errorMessage: "Nie udało się zarezerwować PUSH." };
      }
      if (claimed !== true) {
        return { ok: false, skipped: true, subscriptionId: subscription.id, reason: "duplicate_or_inactive" };
      }
    }
    const attempt = await createDeliveryAttempt(adminClient, {
      user_id: subscription.user_id,
      job_id: job?.id || null,
      type: deliveryLogType,
    });

    if (eventKey && !attempt?.id) {
      return { ok: false, skipped: false, subscriptionId: subscription.id, errorMessage: "Nie udało się utworzyć logu PUSH." };
    }

    const payload = JSON.stringify({
      type: deliveryType,
      jobId: job?.id || null,
      title,
      body: notificationBody,
      url: targetUrl || (job?.id ? `/?jobId=${encodeURIComponent(job.id)}` : "/"),
      tag,
      recipientUserId: String(subscription.user_id || ""),
      subscriptionGeneration: Number(subscription.ownership_generation || 0),
      deliveryReceipt: attempt && receiptEndpoint
        ? {
            deliveryLogId: attempt.id,
            receiptToken: attempt.token,
            endpoint: receiptEndpoint,
          }
        : null,
    });
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      }, payload);

      if (attempt?.id) {
        await finalizeDeliveryAttempt(adminClient, attempt.id, {
          status: "sent",
          response_code: 201,
          error_message: null,
        });
      } else {
        await insertDeliveryRows(adminClient, [{
          user_id: subscription.user_id,
          job_id: job?.id || null,
          type: deliveryLogType,
          status: "sent",
          response_code: 201,
          error_message: null,
        }]);
      }

      return { ok: true, subscriptionId: subscription.id, deliveryLogId: attempt?.id || null };
    } catch (error) {
      const statusCode = typeof error?.statusCode === "number" ? error.statusCode : null;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const status = statusCode === 404 || statusCode === 410 ? "expired" : "error";

      if (attempt?.id) {
        await finalizeDeliveryAttempt(adminClient, attempt.id, {
          status,
          response_code: statusCode,
          error_message: errorMessage,
        });
      } else {
        await insertDeliveryRows(adminClient, [{
          user_id: subscription.user_id,
          job_id: job?.id || null,
          type: deliveryLogType,
          status,
          response_code: statusCode,
          error_message: errorMessage,
        }]);
      }

      if (statusCode === 404 || statusCode === 410) {
        // 10.78: odpowiedź starej wysyłki nie może wyłączyć endpointu po handoffie A→B.
        // Dezaktywujemy tylko dokładnie tę własność/generację, z której wystartowała wysyłka.
        await adminClient.rpc("push_subscription_expire_atomic", {
          p_request_user_id: subscription.user_id,
          p_endpoint: subscription.endpoint,
          p_p256dh: subscription.p256dh,
          p_auth: subscription.auth,
          p_lifecycle_token: subscription.lifecycle_token || "",
          p_expected_generation: subscription.ownership_generation,
        });
      }

      return { ok: false, subscriptionId: subscription.id, deliveryLogId: attempt?.id || null, statusCode, errorMessage };
    }
  }));

  return json({
    ok: true,
    delivered: results.filter((item: any) => item.ok).length,
    failed: results.filter((item: any) => !item.ok && !item.skipped).length,
    skipped: usersWithoutSubscription.length + results.filter((item: any) => item.skipped).length,
    results,
  });
}

async function createDeliveryAttempt(adminClient: any, row: any) {
  const token = createReceiptToken();
  const receiptTokenHash = await sha256Hex(token);
  const { data, error } = await adminClient
    .from("push_delivery_log")
    .insert({
      ...row,
      status: "sending",
      response_code: null,
      error_message: null,
      receipt_token_hash: receiptTokenHash,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.warn("Nie udało się utworzyć śledzonej próby PUSH:", error?.message || "brak id");
    return null;
  }
  return { id: String(data.id), token };
}

async function finalizeDeliveryAttempt(adminClient: any, deliveryLogId: string, patch: any) {
  const { error } = await adminClient
    .from("push_delivery_log")
    .update(patch)
    .eq("id", deliveryLogId);
  if (error) console.warn("Nie udało się zaktualizować push_delivery_log:", error.message);
}

function createReceiptToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function insertDeliveryRows(adminClient: any, rows: any[]) {
  if (!rows.length) return;
  const { error } = await adminClient.from("push_delivery_log").insert(rows);
  if (error) console.warn("Nie udało się zapisać push_delivery_log:", error.message);
}

function formatWarsawDateTime(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getTodayDateKey(timeZone = "Europe/Warsaw") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeDateKey(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
}

function isInstallationDateInPast(installationDate: unknown) {
  const dateKey = normalizeDateKey(installationDate);
  if (!dateKey) return false;
  return dateKey < getTodayDateKey();
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
