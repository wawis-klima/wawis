import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type PushRequest = {
  jobId?: string;
  commentId?: string;
  assignedUserIds?: string[];
  assignedUserId?: string;
  triggeredBy?: string;
  eventType?: "job_assigned" | "job_completed" | "job_comment" | "push_test" | "sync_subscription" | "disable_subscription" | string;
  subscriptionEndpoint?: string;
  subscription?: {
    endpoint?: string;
    p256dh?: string;
    auth?: string;
    lifecycleToken?: string;
    clientMode?: string;
    userAgent?: string;
    deviceLabel?: string;
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const vapidPublicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY") || "";
    const vapidPrivateKey = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") || "";
    const vapidSubject = Deno.env.get("WEB_PUSH_VAPID_SUBJECT") || "mailto:admin@example.com";

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
      return json({ error: "Brakuje konfiguracji środowiskowej Edge Function dla web push." }, 500);
    }

    const authHeader = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return json({ error: "Brak autoryzacji użytkownika." }, 401);
    }

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", authData.user.id)
      .single();

    if (callerProfileError || !callerProfile) {
      return json({ error: "Nie udało się pobrać profilu użytkownika." }, 403);
    }

    const normalizedCallerRole = String(callerProfile.role || '').trim().toLowerCase();
    const callerIsAdmin = ['administrator', 'admin'].includes(normalizedCallerRole);
    const callerIsStaff = callerIsAdmin || ['employee', 'pracownik'].includes(normalizedCallerRole);

    const body = (await request.json()) as PushRequest;
    const jobId = String(body.jobId || "").trim();
    const eventType = body.eventType === "job_completed"
      ? "job_completed"
      : body.eventType === "job_comment"
        ? "job_comment"
        : body.eventType === "push_test"
          ? "push_test"
          : body.eventType === "sync_subscription"
            ? "sync_subscription"
            : body.eventType === "disable_subscription"
              ? "disable_subscription"
              : "job_assigned";

    console.log("send-assignment-push invoked", {
      jobId: jobId || null,
      eventType,
      triggeredBy: body.triggeredBy || null,
      callerId: authData.user.id,
      callerRole: callerProfile.role,
    });

    if (eventType === "sync_subscription") {
      return await handleSyncSubscription({
        adminClient,
        authUserId: authData.user.id,
        triggeredBy: String(body.triggeredBy || ""),
        subscription: body.subscription || null,
      });
    }

    if (eventType === "disable_subscription") {
      return await handleDisableSubscription({
        adminClient,
        authUserId: authData.user.id,
        triggeredBy: String(body.triggeredBy || ""),
        subscription: body.subscription || null,
      });
    }

    if (eventType === "push_test") {
      if (!callerIsAdmin) {
        return json({ error: "Tylko administrator może uruchomić test push." }, 403);
      }

      return await handlePushTest({
        adminClient,
        authUserId: authData.user.id,
        callerProfile,
        subscriptionEndpoint: String(body.subscriptionEndpoint || "").trim(),
        vapidPublicKey,
        vapidPrivateKey,
        vapidSubject,
      });
    }

    if (!jobId) {
      return json({ error: "Brak jobId." }, 400);
    }

    if (eventType === "job_completed") {
      return await handleJobCompleted({
        adminClient,
        authUserId: authData.user.id,
        callerProfile,
        jobId,
        vapidPublicKey,
        vapidPrivateKey,
        vapidSubject,
      });
    }

    if (eventType === "job_comment") {
      return await handleJobComment({
        adminClient,
        authUserId: authData.user.id,
        callerProfile,
        jobId,
        commentId: String(body.commentId || "").trim(),
        vapidPublicKey,
        vapidPrivateKey,
        vapidSubject,
      });
    }

    if (!callerIsStaff) {
      return json({ error: "Tylko pracownik lub administrator może wysyłać przypisania push." }, 403);
    }

    const assignedUserIds = [...new Set([
      ...(Array.isArray(body.assignedUserIds) ? body.assignedUserIds : []),
      body.assignedUserId || "",
    ].filter(Boolean))];

    if (!assignedUserIds.length) {
      return json({ error: "Brak assignedUserIds." }, 400);
    }

    return await handleJobAssigned({
      adminClient,
      jobId,
      assignedUserIds,
      vapidPublicKey,
      vapidPrivateKey,
      vapidSubject,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

function legacyLifecycleToken(userId: string, endpoint: string) {
  return `legacy:${userId}:${endpoint}`;
}

function pushLifecycleErrorStatus(error: any) {
  const message = String(error?.message || "");
  if (message.includes("push_credentials_mismatch")) return 409;
  if (message.includes("push_owner_active") || message.includes("push_lifecycle_disabled")) return 409;
  if (message.includes("push_invalid_")) return 400;
  return 500;
}

async function handleSyncSubscription({ adminClient, authUserId, triggeredBy, subscription }: any) {
  const endpoint = String(subscription?.endpoint || "").trim();
  const p256dh = String(subscription?.p256dh || "").trim();
  const auth = String(subscription?.auth || "").trim();
  const userAgent = String(subscription?.userAgent || "").slice(0, 1200);
  const deviceLabel = String(subscription?.deviceLabel || "Urządzenie").slice(0, 240);
  const clientMode = String(subscription?.clientMode || "").trim().toLowerCase();
  const suppliedLifecycleToken = String(subscription?.lifecycleToken || "").trim();
  const lifecycleToken = suppliedLifecycleToken || legacyLifecycleToken(String(authUserId), endpoint);

  if (!endpoint || !p256dh || !auth) return json({ error: "Brak kompletnej subskrypcji push." }, 400);

  const legacyMobileClient = !clientMode && /Android|iPhone|iPad|iPod/i.test(userAgent);
  if (clientMode !== "standalone" && !legacyMobileClient) {
    return json({ error: "PUSH działa wyłącznie w zainstalowanej aplikacji Wawis." }, 409);
  }

  // Kompatybilność 10.76: stary klient podczas login-account-handoff nie zna
  // lifecycleToken A. Atomowo wyłączamy wyłącznie rekord legacy z identycznymi kluczami.
  if (!suppliedLifecycleToken && triggeredBy === "login-account-handoff") {
    const { error: cleanupError } = await adminClient.rpc("push_subscription_disable_atomic", {
      p_request_user_id: authUserId,
      p_endpoint: endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
      p_lifecycle_token: "",
      p_allow_foreign_cleanup: true,
      p_allow_legacy_cleanup: true,
    });
    if (cleanupError && !String(cleanupError.message || "").includes("not-found")) {
      return json({ error: cleanupError.message }, pushLifecycleErrorStatus(cleanupError));
    }
  }

  const { data, error } = await adminClient.rpc("push_subscription_sync_atomic", {
    p_user_id: authUserId,
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_lifecycle_token: lifecycleToken,
    p_user_agent: userAgent,
    p_device_label: deviceLabel,
  });
  if (error) return json({ error: error.message }, pushLifecycleErrorStatus(error));

  const row = Array.isArray(data) ? data[0] : data;
  const { data: contextRow, error: contextError } = await adminClient.from('push_subscriptions')
    .select('context_epoch').eq('id', row?.subscription_id).eq('user_id', authUserId)
    .eq('ownership_generation', row?.ownership_generation).eq('is_active', true).single();
  if (contextError || !contextRow?.context_epoch) return json({ error: 'push_stale_context' }, 409);
  console.log("push subscription synchronized atomically", {
    subscriptionId: row?.subscription_id || null,
    authUserId,
    reassigned: Boolean(row?.reassigned),
    generation: Number(row?.ownership_generation || 0),
  });
  return json({
    ok: true,
    reassigned: Boolean(row?.reassigned),
    reason: row?.reason || "ok",
    subscription: row ? {
      id: row.subscription_id,
      user_id: row.owner_user_id,
      is_active: row.is_active,
      last_seen_at: row.last_seen_at,
      ownership_generation: Number(row.ownership_generation || 0),
      context_epoch: Number(contextRow.context_epoch),
    } : null,
  });
}

async function handleDisableSubscription({ adminClient, authUserId, triggeredBy, subscription }: any) {
  const endpoint = String(subscription?.endpoint || "").trim();
  const p256dh = String(subscription?.p256dh || "").trim();
  const auth = String(subscription?.auth || "").trim();
  const suppliedLifecycleToken = String(subscription?.lifecycleToken || "").trim();
  if (!endpoint || !p256dh || !auth) return json({ error: "Brak kompletnej subskrypcji push do wyłączenia." }, 400);

  const staleCleanup = triggeredBy === "login-stale-cleanup";
  const lifecycleToken = suppliedLifecycleToken || (staleCleanup ? "" : legacyLifecycleToken(String(authUserId), endpoint));
  const { data, error } = await adminClient.rpc("push_subscription_disable_atomic", {
    p_request_user_id: authUserId,
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_lifecycle_token: lifecycleToken,
    p_allow_foreign_cleanup: staleCleanup,
    p_allow_legacy_cleanup: staleCleanup && !suppliedLifecycleToken,
  });
  if (error) return json({ error: error.message }, pushLifecycleErrorStatus(error));

  const row = Array.isArray(data) ? data[0] : data;
  console.log("push subscription disabled atomically", {
    subscriptionId: row?.subscription_id || null,
    authUserId,
    disabled: Boolean(row?.disabled),
    reason: row?.reason || null,
    generation: Number(row?.ownership_generation || 0),
  });
  return json({
    ok: true,
    disabled: Boolean(row?.disabled),
    reason: row?.reason || "not-found",
    ownership_generation: Number(row?.ownership_generation || 0),
  });
}

async function handleJobAssigned({
  adminClient,
  jobId,
  assignedUserIds,
  vapidPublicKey,
  vapidPrivateKey,
  vapidSubject,
}: any) {
  const { data: job, error: jobError } = await adminClient
    .from("jobs")
    .select("id, client, title, city, street, status, installation_date, created_at")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return json({ error: "Nie znaleziono zlecenia." }, 404);
  }

  if (isInstallationDateInPast(job.installation_date)) {
    await insertDeliveryRows(adminClient, assignedUserIds.map((userId: string) => ({
      user_id: userId,
      job_id: job?.id || null,
      type: "job_assigned",
      status: "skipped",
      response_code: null,
      error_message: "Data montażu jest w przeszłości — push nie został wysłany.",
    })));

    return json({
      ok: true,
      delivered: 0,
      skipped: assignedUserIds.length,
      reason: "Data montażu jest w przeszłości — push nie został wysłany.",
    });
  }

  const address = [job.city, job.street].filter(Boolean).join(", ") || job.client || job.title || "Zlecenie";
  return await sendPushToUsers({
    adminClient,
    userIds: assignedUserIds,
    job,
    deliveryType: "job_assigned",
    title: "Nowy montaż",
    body: `Przydzielono Ci montaż: ${address}`,
    tag: `job-assigned-${job.id}`,
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject,
  });
}

async function handlePushTest({
  adminClient,
  authUserId,
  callerProfile,
  subscriptionEndpoint,
  vapidPublicKey,
  vapidPrivateKey,
  vapidSubject,
}: any) {
  const displayName = String(callerProfile?.full_name || "Administrator").trim() || "Administrator";

  return await sendPushToUsers({
    adminClient,
    userIds: [authUserId],
    job: null,
    deliveryType: "push_test",
    title: "Test powiadomień Wawis",
    body: `Powiadomienia push działają. Odbiorca: ${displayName}.`,
    tag: `push-test-${authUserId}-${Date.now()}`,
    targetUrl: "/",
    subscriptionEndpoint,
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject,
  });
}

async function handleJobCompleted({
  adminClient,
  authUserId,
  callerProfile,
  jobId,
  vapidPublicKey,
  vapidPrivateKey,
  vapidSubject,
}: any) {
  const completionLookup = await loadCompletedJobWithRetry(adminClient, jobId);
  const job = completionLookup.job;

  if (completionLookup.error || !job) {
    return json({ error: "Nie znaleziono zlecenia." }, 404);
  }

  if (String(job.status || "") !== "Zakończone") {
    return json({
      error: "Zlecenie nie ma statusu Zakończone — push nie został wysłany.",
      retryable: true,
      attempts: completionLookup.attempts,
    }, 409);
  }

  const normalizedCallerRole = String(callerProfile?.role || '').trim().toLowerCase();
  if (!['employee', 'pracownik', 'admin', 'administrator'].includes(normalizedCallerRole)) {
    return json({ error: "Brak uprawnień pracownika do tego zlecenia." }, 403);
  }

  const { data: adminProfiles, error: adminProfilesError } = await adminClient
    .from("profiles")
    .select("id")
    .eq("role", "Administrator");

  if (adminProfilesError) {
    return json({ error: adminProfilesError.message }, 500);
  }

  const adminUserIds = [...new Set((adminProfiles || []).map((profile: any) => String(profile.id || "")).filter(Boolean))];
  if (!adminUserIds.length) {
    return json({ ok: true, delivered: 0, skipped: 0, reason: "Brak profilu administratora." });
  }

  let targetAdminIds = adminUserIds;
  if (job.completed_at) {
    const { data: sentLogs } = await adminClient
      .from("push_delivery_log")
      .select("user_id")
      .eq("job_id", job.id)
      .eq("type", "job_completed")
      .eq("status", "sent")
      .gte("created_at", job.completed_at);

    const alreadySent = new Set((sentLogs || []).map((row: any) => String(row.user_id || "")).filter(Boolean));
    targetAdminIds = adminUserIds.filter((userId) => !alreadySent.has(userId));
  }

  if (!targetAdminIds.length) {
    return json({ ok: true, delivered: 0, skipped: adminUserIds.length, alreadyDelivered: true });
  }

  const subject = job.client || job.title || [job.city, job.street].filter(Boolean).join(", ") || "Montaż";
  const address = [job.city, job.street].filter(Boolean).join(", ");
  const completedBy = String(callerProfile.full_name || "Pracownik").trim() || "Pracownik";
  const completedTime = formatWarsawDateTime(job.completed_at);
  const bodyParts = [subject, address, completedTime ? `godz. ${completedTime}` : ""].filter(Boolean);

  return await sendPushToUsers({
    adminClient,
    userIds: targetAdminIds,
    job,
    deliveryType: "job_completed",
    title: `${completedBy} zakończył zlecenie`,
    body: bodyParts.join(" • "),
    tag: `job-completed-${job.id}-${job.completed_at || "now"}`,
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject,
  });
}

async function handleJobComment({
  adminClient,
  authUserId,
  callerProfile,
  jobId,
  commentId,
  vapidPublicKey,
  vapidPrivateKey,
  vapidSubject,
}: any) {
  if (callerProfile.role === "Administrator") {
    return json({ ok: true, delivered: 0, skipped: 1, reason: "Komentarz administratora nie wymaga powiadomienia push." });
  }

  if (!commentId) {
    return json({ error: "Brak commentId." }, 400);
  }

  const { data: comment, error: commentError } = await adminClient
    .from("comments")
    .select("id, job_id, author_id, text, created_at")
    .eq("id", commentId)
    .maybeSingle();

  if (commentError) return json({ error: commentError.message }, 500);
  if (!comment || String(comment.job_id || "") !== String(jobId) || String(comment.author_id || "") !== String(authUserId)) {
    return json({ error: "Nie znaleziono komentarza zapisanego przez zalogowanego pracownika." }, 403);
  }

  const { data: job, error: jobError } = await adminClient
    .from("jobs")
    .select("id, client, title, city, street, main_technician_id")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) return json({ error: jobError.message }, 500);
  if (!job) return json({ error: "Nie znaleziono zlecenia." }, 404);

  const normalizedCommentCallerRole = String(callerProfile?.role || '').trim().toLowerCase();
  if (!['employee', 'pracownik'].includes(normalizedCommentCallerRole)) {
    return json({ error: "Tylko pracownik może wysłać powiadomienie o komentarzu." }, 403);
  }

  const { data: adminProfiles, error: adminProfilesError } = await adminClient
    .from("profiles")
    .select("id")
    .eq("role", "Administrator");

  if (adminProfilesError) return json({ error: adminProfilesError.message }, 500);

  const adminUserIds = [...new Set((adminProfiles || [])
    .map((profile: any) => String(profile.id || ""))
    .filter((userId: string) => Boolean(userId) && userId !== String(authUserId)))];

  if (!adminUserIds.length) {
    return json({ ok: true, delivered: 0, skipped: 0, reason: "Brak profilu administratora." });
  }

  const deliveryLogType = `job_comment:${comment.id}`;
  const { data: sentLogs, error: sentLogsError } = await adminClient
    .from("push_delivery_log")
    .select("user_id")
    .eq("job_id", job.id)
    .eq("type", deliveryLogType)
    .eq("status", "sent");

  if (sentLogsError) return json({ error: sentLogsError.message }, 500);

  const alreadySent = new Set((sentLogs || []).map((row: any) => String(row.user_id || "")).filter(Boolean));
  const targetAdminIds = adminUserIds.filter((userId) => !alreadySent.has(userId));
  if (!targetAdminIds.length) {
    return json({ ok: true, delivered: 0, skipped: adminUserIds.length, alreadyDelivered: true });
  }

  const subject = job.client || job.title || "Montaż";
  const address = [job.city, job.street].filter(Boolean).join(", ");
  const author = callerProfile.full_name || "Pracownik";
  const body = [author, subject, address].filter(Boolean).join(" • ");

  return await sendPushToUsers({
    adminClient,
    userIds: targetAdminIds,
    job,
    deliveryType: "job_comment",
    deliveryLogType,
    title: "Nowy komentarz do montażu",
    body,
    tag: `job-comment-${comment.id}`,
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject,
  });
}

async function loadCompletedJobWithRetry(adminClient: any, jobId: string) {
  const retryDelaysMs = [0, 250, 700, 1400];
  let lastJob: any = null;
  let lastError: any = null;

  for (let index = 0; index < retryDelaysMs.length; index += 1) {
    const delayMs = retryDelaysMs[index];
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const { data, error } = await adminClient
      .from("jobs")
      .select("id, client, title, city, street, status, installation_date, main_technician_id, completed_at")
      .eq("id", jobId)
      .single();

    if (error) {
      lastError = error;
      if (index === 0) break;
      continue;
    }

    lastJob = data;
    if (String(data?.status || "") === "Zakończone") {
      return { job: data, error: null, attempts: index + 1 };
    }
  }

  return { job: lastJob, error: lastError, attempts: retryDelaysMs.length };
}

async function sendPushToUsers({
  adminClient,
  userIds,
  job,
  deliveryType,
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

  const results = await Promise.all(subscriptions.map(async (subscription: any) => {
    const payload = JSON.stringify({
      type: deliveryType,
      jobId: job?.id || null,
      title,
      body: notificationBody,
      url: targetUrl || (job?.id ? `/?jobId=${encodeURIComponent(job.id)}` : "/"),
      tag,
      recipientUserId: String(subscription.user_id || ""),
      subscriptionGeneration: Number(subscription.ownership_generation || 0),
    });
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      }, payload);

      await insertDeliveryRows(adminClient, [{
        user_id: subscription.user_id,
        job_id: job?.id || null,
        type: deliveryLogType,
        status: "sent",
        response_code: 201,
        error_message: null,
      }]);

      return { ok: true, subscriptionId: subscription.id };
    } catch (error) {
      const statusCode = typeof error?.statusCode === "number" ? error.statusCode : null;
      const errorMessage = error instanceof Error ? error.message : String(error);

      await insertDeliveryRows(adminClient, [{
        user_id: subscription.user_id,
        job_id: job?.id || null,
        type: deliveryLogType,
        status: statusCode === 404 || statusCode === 410 ? "expired" : "error",
        response_code: statusCode,
        error_message: errorMessage,
      }]);

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

      return { ok: false, subscriptionId: subscription.id, statusCode, errorMessage };
    }
  }));

  return json({
    ok: true,
    delivered: results.filter((item: any) => item.ok).length,
    failed: results.filter((item: any) => !item.ok).length,
    skipped: usersWithoutSubscription.length,
    results,
  });
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
