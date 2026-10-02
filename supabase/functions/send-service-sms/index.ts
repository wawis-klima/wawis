import { sendServiceSmsOnce, SmsDeliveryBlockedError } from './delivery.ts';
import { createClient } from "npm:@supabase/supabase-js@2";

type DeleteRow = {
  logId?: string | null;
  jobId?: string | null;
  deviceId?: string | null;
  client?: string | null;
  phone?: string | null;
  message?: string | null;
  reminderCycle?: number | string | null;
  reminderDueDate?: string | null;
};

type SmsRequest = {
  mode?: "manual" | "approval" | "auto" | "delete";
  jobId?: string;
  deviceId?: string;
  logIds?: string[];
  rows?: DeleteRow[];
  reminderCycle?: number | string | null;
  reminderDueDate?: string | null;
};

type SmsSettings = {
  is_enabled: boolean;
  sending_mode: string | null;
  sender_name: string | null;
  service_phone: string | null;
  company_name: string | null;
  template_service_reminder: string;
};

type SmsApiResult = {
  providerMessageId: string | null;
  responseBody: unknown;
  recipientPhone: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const smsApiToken = Deno.env.get("SMSAPI_ACCESS_TOKEN") || "";
    const smsApiSender = Deno.env.get("SMSAPI_SENDER") || "";

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) return json({ error: "Brakuje konfiguracji Supabase dla funkcji send-service-sms." }, 500);

    const authHeader = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: `Brak autoryzacji użytkownika. ${authError?.message || ""}`.trim() }, 401);

    const { data: callerProfile, error: callerProfileError } = await adminClient.from("profiles").select("id, role").eq("id", authData.user.id).single();
    if (callerProfileError || !callerProfile || !isAdminRole(callerProfile.role)) return json({ error: "Tylko administrator może wysyłać SMS-y serwisowe." }, 403);

    const body = (await request.json()) as SmsRequest;
    const nowIso = new Date().toISOString();

    if (body.mode === "delete") {
      return await handleDeleteLogs({ adminClient, callerId: callerProfile.id, rows: Array.isArray(body.rows) ? body.rows : [] });
    }

    const settings = await loadSettings(adminClient);
    if (!settings.is_enabled) return json({ error: "Moduł SMS jest wyłączony w ustawieniach." }, 400);
    if (!smsApiToken) return json({ error: "Brakuje sekretu SMSAPI_ACCESS_TOKEN." }, 500);

    const sender = (settings.sender_name || smsApiSender || "").trim() || undefined;

    if (body.mode === "approval") {
      return await handleApprovalSend({ adminClient, callerId: callerProfile.id, settings, sender, token: smsApiToken, nowIso, logIds: body.logIds || [] });
    }

    if (body.deviceId) {
      return await handleManualDeviceSend({ adminClient, callerId: callerProfile.id, settings, sender, token: smsApiToken, nowIso, deviceId: body.deviceId, reminderCycle: body.reminderCycle, reminderDueDate: body.reminderDueDate || null });
    }

    if (body.jobId) {
      return await handleManualJobSend({ adminClient, callerId: callerProfile.id, settings, sender, token: smsApiToken, nowIso, jobId: body.jobId, reminderCycle: body.reminderCycle, reminderDueDate: body.reminderDueDate || null });
    }

    return json({ error: "Brak jobId lub deviceId dla wysyłki ręcznej." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function loadSettings(adminClient: ReturnType<typeof createClient>): Promise<SmsSettings> {
  const { data: row } = await adminClient
    .from("sms_settings")
    .select("is_enabled, sending_mode, sender_name, service_phone, company_name, template_service_reminder")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    is_enabled: row?.is_enabled ?? true,
    sending_mode: row?.sending_mode ?? "approval",
    sender_name: row?.sender_name ?? null,
    service_phone: row?.service_phone ?? null,
    company_name: row?.company_name ?? "Wawis Klimatyzacja",
    template_service_reminder:
      row?.template_service_reminder ||
      "Dzień dobry {client}, przypominamy o obowiązkowym przeglądzie klimatyzacji po 11 miesiącach od montażu. Aby utrzymać gwarancję, prosimy o kontakt: {service_phone}. {company_name}",
  };
}

async function handleApprovalSend({ adminClient, callerId, settings, sender, token, nowIso, logIds }: { adminClient: ReturnType<typeof createClient>; callerId: string; settings: SmsSettings; sender?: string; token: string; nowIso: string; logIds: string[]; }) {
  const cleanIds = Array.isArray(logIds) ? logIds.filter(Boolean) : [];
  if (cleanIds.length === 0) return json({ error: "Nie przekazano pozycji z kolejki do wysyłki." }, 400);

  const { data: logs, error } = await adminClient
    .from("sms_log")
    .select("id, job_id, device_id, status, reminder_cycle")
    .in("id", cleanIds);

  if (error) return json({ error: error.message }, 400);

  let sentCount = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const log of logs || []) {
    if (log.status !== "pending_approval") continue;

    let currentMessage = "";
    try {
      const smsResult = await sendServiceSmsOnce({
        adminClient,
        logId: log.id,
        jobId: log.job_id,
        deviceId: log.device_id,
        cycle: log.reminder_cycle || 1,
        send: (prepared) => {
          currentMessage = buildMessage({
            client: prepared.client,
            installation_date: prepared.installationDate,
            service_due_date: prepared.currentDueDate,
            reminder_due_date: prepared.currentDueDate,
            phone: prepared.recipientPhone,
          }, settings);
          return sendSmsWithSmsApi({
            token,
            to: prepared.recipientPhone,
            message: currentMessage,
            from: sender,
          });
        },
      });

      await updateSmsLog(adminClient, log.id, {
        job_id: smsResult.linkedJobId,
        device_id: smsResult.deviceId,
        client: smsResult.client,
        phone: smsResult.recipientPhone,
        message: currentMessage,
        status: "provider_sent",
        approved_at: nowIso,
        approved_by: callerId,
        sent_at: nowIso,
        provider_message_id: smsResult.providerMessageId,
        provider_response: safeJson(smsResult.responseBody),
        reminder_cycle: smsResult.cycle,
        reminder_due_date: smsResult.currentDueDate,
        reminder_group_id: smsResult.reminderGroupId,
        reminder_group_primary: true,
        error_message: null,
      });

      if (smsResult.linkedJobId) {
        await adminClient.from("jobs").update({
          last_sms_sent_at: nowIso,
          last_sms_status: "provider_sent",
          last_sms_error: null,
          sms_recipient_phone: smsResult.recipientPhone,
        }).eq("id", smsResult.linkedJobId);
      }

      sentCount += 1;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      failures.push({ id: log.id, error: errorMessage });
      if (e instanceof SmsDeliveryBlockedError) continue;
      await updateSmsLog(adminClient, log.id, {
        status: "error",
        approved_at: nowIso,
        approved_by: callerId,
        error_message: errorMessage,
      });
    }
  }

  return json({ ok: failures.length === 0, sentCount, failures });
}

async function handleDeleteLogs({ adminClient, callerId, rows }: { adminClient: ReturnType<typeof createClient>; callerId: string; rows: DeleteRow[]; }) {
  const cleanRows = Array.isArray(rows) ? rows.filter((row) => row && (row.logId || row.deviceId || row.jobId)) : [];
  if (cleanRows.length === 0) return json({ error: "Nie przekazano pozycji z kolejki do usunięcia." }, 400);

  const logIds = [...new Set(
    cleanRows
      .map((row) => String(row.logId || "").trim())
      .filter((id) => isUuid(id)),
  )];

  if (logIds.length === 0) {
    return json({
      ok: false,
      error: "Ta pozycja nie ma jeszcze trwałego wpisu kolejki. Odśwież listę SMS i spróbuj ponownie.",
      deletedCount: 0,
      failures: [],
    }, 409);
  }

  let deletedCount = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const logId of logIds) {
    const { data, error } = await adminClient.rpc("cancel_service_sms_log", {
      p_log_id: logId,
      p_actor_id: callerId,
    });

    if (error) {
      failures.push({ id: logId, error: error.message || "Nie udało się bezpiecznie anulować SMS-a." });
      continue;
    }

    const result = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    if (result.cancelled === true || result.already_deleted === true) {
      deletedCount += 1;
      continue;
    }

    const reason = String(result.reason || "Pozycja nie może zostać anulowana, ponieważ wysyłka już się rozpoczęła albo stan uległ zmianie.");
    failures.push({ id: logId, error: reason });
  }

  if (failures.length > 0) {
    return json({
      ok: false,
      error: "Nie wszystkie pozycje można było anulować. Lista została zabezpieczona przed zmianą historii wysłanych SMS-ów.",
      deletedCount,
      failures,
    }, 409);
  }

  return json({ ok: true, deletedCount, failures: [] });
}

async function handleManualJobSend({ adminClient, callerId, settings, sender, token, nowIso, jobId, reminderCycle, reminderDueDate: _reminderDueDate }: { adminClient: ReturnType<typeof createClient>; callerId: string; settings: SmsSettings; sender?: string; token: string; nowIso: string; jobId: string; reminderCycle?: number | string | null; reminderDueDate?: string | null; }) {
  const effectiveCycle = Number.parseInt(String(reminderCycle ?? ""), 10) || 1;
  let currentMessage = "";

  try {
    const smsResult = await sendServiceSmsOnce({
      adminClient,
      jobId,
      cycle: effectiveCycle,
      send: (prepared) => {
        currentMessage = buildMessage({
          client: prepared.client,
          installation_date: prepared.installationDate,
          service_due_date: prepared.currentDueDate,
          reminder_due_date: prepared.currentDueDate,
          phone: prepared.recipientPhone,
        }, settings);
        return sendSmsWithSmsApi({
          token,
          to: prepared.recipientPhone,
          message: currentMessage,
          from: sender,
        });
      },
    });

    await upsertFinalizedCycleLog(adminClient, {
      job_id: smsResult.linkedJobId,
      device_id: smsResult.deviceId,
      client: smsResult.client,
      phone: smsResult.recipientPhone,
      message: currentMessage,
      sms_type: "service_reminder",
      provider: "smsapi",
      provider_message_id: smsResult.providerMessageId,
      provider_response: safeJson(smsResult.responseBody),
      status: "sent",
      planned_for: nowIso,
      approved_at: nowIso,
      approved_by: callerId,
      sent_at: nowIso,
      created_by: callerId,
      reminder_cycle: smsResult.cycle,
      reminder_due_date: smsResult.currentDueDate,
      reminder_group_id: smsResult.reminderGroupId,
      reminder_group_primary: true,
      error_message: null,
    });

    if (smsResult.linkedJobId) {
      await adminClient.from("jobs").update({
        last_sms_sent_at: nowIso,
        last_sms_status: "provider_sent",
        last_sms_error: null,
        sms_recipient_phone: smsResult.recipientPhone,
      }).eq("id", smsResult.linkedJobId);
    }

    return json({
      ok: true,
      recipientPhone: smsResult.recipientPhone,
      providerMessageId: smsResult.providerMessageId,
      providerResponse: smsResult.responseBody,
      reminderDueDate: smsResult.currentDueDate,
    });
  } catch (e) {
    if (e instanceof SmsDeliveryBlockedError) return json({ error: e.message, reason: e.reason }, 409);

    const errorMessage = e instanceof Error ? e.message : String(e);
    const prepared = getPreparedSmsFromError(e);

    if (prepared) {
      await upsertFinalizedCycleLog(adminClient, {
        job_id: prepared.linkedJobId,
        device_id: prepared.deviceId,
        client: prepared.client,
        phone: prepared.recipientPhone,
        message: currentMessage,
        sms_type: "service_reminder",
        provider: "smsapi",
        status: "error",
        planned_for: nowIso,
        approved_at: nowIso,
        approved_by: callerId,
        created_by: callerId,
        reminder_cycle: prepared.cycle,
        reminder_due_date: prepared.currentDueDate,
        reminder_group_id: prepared.reminderGroupId,
        reminder_group_primary: true,
        error_message: errorMessage,
      });

      if (prepared.linkedJobId) {
        await adminClient.from("jobs").update({
          last_sms_status: "error",
          last_sms_error: errorMessage,
          sms_recipient_phone: prepared.recipientPhone,
        }).eq("id", prepared.linkedJobId);
      }
    }

    return json({ error: errorMessage }, 500);
  }
}

async function handleManualDeviceSend({ adminClient, callerId, settings, sender, token, nowIso, deviceId, reminderCycle, reminderDueDate: _reminderDueDate }: { adminClient: ReturnType<typeof createClient>; callerId: string; settings: SmsSettings; sender?: string; token: string; nowIso: string; deviceId: string; reminderCycle?: number | string | null; reminderDueDate?: string | null; }) {
  const effectiveCycle = Number.parseInt(String(reminderCycle ?? ""), 10) || 1;
  let currentMessage = "";

  try {
    const smsResult = await sendServiceSmsOnce({
      adminClient,
      deviceId,
      cycle: effectiveCycle,
      send: (prepared) => {
        currentMessage = buildMessage({
          client: prepared.client,
          installation_date: prepared.installationDate,
          service_due_date: prepared.currentDueDate,
          reminder_due_date: prepared.currentDueDate,
          phone: prepared.recipientPhone,
        }, settings);
        return sendSmsWithSmsApi({
          token,
          to: prepared.recipientPhone,
          message: currentMessage,
          from: sender,
        });
      },
    });

    await upsertFinalizedCycleLog(adminClient, {
      device_id: smsResult.deviceId,
      job_id: smsResult.linkedJobId,
      client: smsResult.client,
      phone: smsResult.recipientPhone,
      message: currentMessage,
      sms_type: "service_reminder",
      provider: "smsapi",
      provider_message_id: smsResult.providerMessageId,
      provider_response: safeJson(smsResult.responseBody),
      status: "sent",
      planned_for: nowIso,
      approved_at: nowIso,
      approved_by: callerId,
      sent_at: nowIso,
      created_by: callerId,
      reminder_cycle: smsResult.cycle,
      reminder_due_date: smsResult.currentDueDate,
      reminder_group_id: smsResult.reminderGroupId,
      reminder_group_primary: true,
      error_message: null,
    });

    if (smsResult.linkedJobId) {
      await adminClient.from("jobs").update({
        last_sms_sent_at: nowIso,
        last_sms_status: "provider_sent",
        last_sms_error: null,
        sms_recipient_phone: smsResult.recipientPhone,
      }).eq("id", smsResult.linkedJobId);
    }

    return json({
      ok: true,
      recipientPhone: smsResult.recipientPhone,
      providerMessageId: smsResult.providerMessageId,
      providerResponse: smsResult.responseBody,
      reminderDueDate: smsResult.currentDueDate,
    });
  } catch (e) {
    if (e instanceof SmsDeliveryBlockedError) return json({ error: e.message, reason: e.reason }, 409);

    const errorMessage = e instanceof Error ? e.message : String(e);
    const prepared = getPreparedSmsFromError(e);

    if (prepared) {
      await upsertFinalizedCycleLog(adminClient, {
        device_id: prepared.deviceId,
        job_id: prepared.linkedJobId,
        client: prepared.client,
        phone: prepared.recipientPhone,
        message: currentMessage,
        sms_type: "service_reminder",
        provider: "smsapi",
        status: "error",
        planned_for: nowIso,
        approved_at: nowIso,
        approved_by: callerId,
        created_by: callerId,
        reminder_cycle: prepared.cycle,
        reminder_due_date: prepared.currentDueDate,
        reminder_group_id: prepared.reminderGroupId,
        reminder_group_primary: true,
        error_message: errorMessage,
      });

      if (prepared.linkedJobId) {
        await adminClient.from("jobs").update({
          last_sms_status: "error",
          last_sms_error: errorMessage,
          sms_recipient_phone: prepared.recipientPhone,
        }).eq("id", prepared.linkedJobId);
      }
    }

    return json({ error: errorMessage }, 500);
  }
}

function isAdminRole(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "administrator" || normalized === "admin";
}

function buildMessage(target: Record<string, unknown>, settings: SmsSettings) {
  const template = settings.template_service_reminder;
  const client = String(target.client || target.title || "Kliencie");
  const installationDate = formatDate(String(target.installation_date || ""));
  const serviceDueDate = formatDate(String(target.service_due_date || ""));
  const servicePhone = settings.service_phone || String(target.phone || "");
  const companyName = settings.company_name || "Wawis Klimatyzacja";
  return template.replaceAll("{client}", client).replaceAll("{installation_date}", installationDate).replaceAll("{service_due_date}", serviceDueDate).replaceAll("{service_phone}", servicePhone).replaceAll("{company_name}", companyName);
}

function formatDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}.${match[2]}.${match[1]}`;
  return value;
}

function safeJson(value: unknown) {
  try { return JSON.parse(JSON.stringify(value ?? null)); } catch { return { raw: String(value) }; }
}

function getPreparedSmsFromError(error: unknown) {
  const prepared = (error as { preparedSms?: Record<string, unknown> } | null)?.preparedSms;
  if (!prepared || typeof prepared !== "object") return null;
  const reminderGroupId = String(prepared.reminderGroupId || "").trim();
  const recipientPhone = String(prepared.recipientPhone || "").trim();
  const currentDueDate = String(prepared.currentDueDate || "").trim();
  if (!isUuid(reminderGroupId) || !recipientPhone || !currentDueDate) return null;
  return prepared as {
    reminderGroupId: string;
    recipientPhone: string;
    currentDueDate: string;
    linkedJobId: string | null;
    deviceId: string | null;
    installationDate: string;
    client: string;
    cycle: number;
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function deriveSmsApiCallbackToken(accessToken: string) {
  const source = `wawis:smsapi-callback:v1:${String(accessToken || '')}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function sendSmsWithSmsApi({ token, to, message, from }: { token: string; to: string; message: string; from?: string }): Promise<SmsApiResult> {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  if (!supabaseUrl) throw new Error('Brak SUPABASE_URL do skonfigurowania callbacku SMSAPI.');
  const callbackToken = await deriveSmsApiCallbackToken(token);
  const notifyUrl = `${supabaseUrl}/functions/v1/smsapi-delivery-webhook?auth=${encodeURIComponent(callbackToken)}`;
  const payload = new URLSearchParams({ to, message, format: "json", encoding: "utf-8", notify_url: notifyUrl });
  if (from) payload.set("from", from);
  const response = await fetch("https://api.smsapi.pl/sms.do", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: payload,
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!response.ok) throw new Error(`SMSAPI zwróciło błąd ${response.status}: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`);
  const list = Array.isArray((parsed as Record<string, unknown> | null)?.list) ? ((parsed as { list?: Array<Record<string, unknown>> }).list || []) : [];
  const providerMessageId = typeof list[0]?.id === "string" ? String(list[0].id) : null;
  if (!providerMessageId) throw new Error(`SMSAPI nie potwierdziło przyjęcia wiadomości: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`);
  return { providerMessageId, responseBody: parsed, recipientPhone: to };
}

async function updateSmsLog(adminClient: ReturnType<typeof createClient>, id: string, patch: Record<string, unknown>) {
  const { error } = await adminClient.from("sms_log").update(patch).eq("id", id);
  if (error) console.error("sms_log update failed", id, error.message);
}

async function upsertFinalizedCycleLog(adminClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const reminderGroupId = isUuid(String(payload.reminder_group_id || "")) ? String(payload.reminder_group_id) : null;
  const jobId = isUuid(String(payload.job_id || "")) ? String(payload.job_id) : null;
  const deviceId = isUuid(String(payload.device_id || "")) ? String(payload.device_id) : null;
  const cycle = Number.parseInt(String(payload.reminder_cycle ?? ""), 10) || 1;

  if (reminderGroupId) {
    const { data: existingGroupLog, error: groupError } = await adminClient
      .from("sms_log")
      .select("id, status")
      .eq("reminder_group_id", reminderGroupId)
      .eq("reminder_group_primary", true)
      .limit(1)
      .maybeSingle();

    if (!groupError && existingGroupLog?.id) {
      await updateSmsLog(adminClient, existingGroupLog.id, {
        ...payload,
        reminder_group_id: reminderGroupId,
        reminder_group_primary: true,
      });
      return;
    }

    await updateSmsLogInsert(adminClient, {
      ...payload,
      reminder_group_id: reminderGroupId,
      reminder_group_primary: true,
    });
    return;
  }

  let query = adminClient
    .from("sms_log")
    .select("id, status")
    .eq("sms_type", "service_reminder")
    .eq("reminder_cycle", cycle)
    .limit(1);

  if (deviceId) {
    query = query.eq("device_id", deviceId);
  } else if (jobId) {
    query = query.eq("job_id", jobId);
  } else {
    await updateSmsLogInsert(adminClient, payload);
    return;
  }

  const { data: existing, error } = await query.maybeSingle();
  if (!error && existing?.id && String(existing.status || "").trim().toLowerCase() === "pending_approval") {
    await updateSmsLog(adminClient, existing.id, payload);
    return;
  }

  await updateSmsLogInsert(adminClient, payload);
}

async function updateSmsLogInsert(adminClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const { error } = await adminClient.from("sms_log").insert(payload);
  if (!error) return;
  const fallbackPayload = { ...payload };
  delete fallbackPayload.provider_response;
  const fallback = await adminClient.from("sms_log").insert(fallbackPayload);
  if (fallback.error) console.error("sms_log insert failed", fallback.error.message);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
