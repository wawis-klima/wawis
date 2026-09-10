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
      return await handleDeleteLogs({ adminClient, callerId: callerProfile.id, nowIso, rows: Array.isArray(body.rows) ? body.rows : [] });
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
    .select("id, job_id, device_id, client, phone, message, status")
    .in("id", cleanIds);

  if (error) return json({ error: error.message }, 400);

  let sentCount = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const log of logs || []) {
    if (log.status !== "pending_approval") continue;
    try {
      const smsResult = await sendSmsWithSmsApi({ token, to: normalizePhone(log.phone || ""), message: log.message || "", from: sender });
      await updateSmsLog(adminClient, log.id, {
        status: "provider_sent",
        approved_at: nowIso,
        approved_by: callerId,
        sent_at: nowIso,
        provider_message_id: smsResult.providerMessageId,
        provider_response: safeJson(smsResult.responseBody),
        phone: smsResult.recipientPhone,
        error_message: null,
      });
      if (log.job_id) {
        await adminClient.from("jobs").update({ last_sms_sent_at: nowIso, last_sms_status: "provider_sent", last_sms_error: null, sms_recipient_phone: smsResult.recipientPhone }).eq("id", log.job_id);
      }
      sentCount += 1;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      failures.push({ id: log.id, error: errorMessage });
      await updateSmsLog(adminClient, log.id, { status: "error", approved_at: nowIso, approved_by: callerId, error_message: errorMessage });
    }
  }

  return json({ ok: failures.length === 0, sentCount, failures });
}


async function handleDeleteLogs({ adminClient, callerId, nowIso, rows }: { adminClient: ReturnType<typeof createClient>; callerId: string; nowIso: string; rows: DeleteRow[]; }) {
  const cleanRows = Array.isArray(rows) ? rows.filter((row) => row && (row.logId || row.deviceId || row.jobId)) : [];
  if (cleanRows.length === 0) return json({ error: "Nie przekazano pozycji z kolejki do usunięcia." }, 400);

  let deletedCount = 0;

  for (const row of cleanRows) {
    const normalizedJobId = isUuid(String(row.jobId || "")) ? String(row.jobId) : null;
    const normalizedPhone = row.phone ? normalizePhone(String(row.phone)) : null;
    const patch = {
      status: "deleted",
      approved_at: nowIso,
      approved_by: callerId,
      error_message: null,
      device_id: isUuid(String(row.deviceId || "")) ? String(row.deviceId) : null,
      job_id: normalizedJobId,
      reminder_cycle: Number.parseInt(String(row.reminderCycle ?? ""), 10) || 1,
      reminder_due_date: row.reminderDueDate || null,
      client: row.client || null,
      phone: normalizedPhone,
      message: row.message || null,
      sms_type: "service_reminder",
      provider: "smsapi",
    } as Record<string, unknown>;

    if (row.logId) {
      const { error } = await adminClient
        .from("sms_log")
        .update(patch)
        .eq("id", String(row.logId));
      if (!error) {
        if (normalizedJobId) {
          await adminClient.from("jobs").update({ last_sms_status: "deleted", last_sms_error: null, sms_recipient_phone: normalizedPhone }).eq("id", normalizedJobId);
        }
        deletedCount += 1;
        continue;
      }
    }

    await updateSmsLogInsert(adminClient, {
      ...patch,
      created_by: callerId,
      planned_for: nowIso,
      sent_at: null,
      provider_message_id: null,
      provider_response: null,
    });
    if (normalizedJobId) {
      await adminClient.from("jobs").update({ last_sms_status: "deleted", last_sms_error: null, sms_recipient_phone: normalizedPhone }).eq("id", normalizedJobId);
    }
    deletedCount += 1;
  }

  return json({ ok: true, deletedCount });
}

async function handleManualJobSend({ adminClient, callerId, settings, sender, token, nowIso, jobId, reminderCycle, reminderDueDate }: { adminClient: ReturnType<typeof createClient>; callerId: string; settings: SmsSettings; sender?: string; token: string; nowIso: string; jobId: string; reminderCycle?: number | string | null; reminderDueDate?: string | null; }) {
  const { data: job, error } = await adminClient
    .from("jobs")
    .select("id, client, title, phone, installation_date, service_due_date, sms_consent, sms_reminder_enabled, sms_recipient_phone")
    .eq("id", jobId)
    .single();

  if (error || !job) return json({ error: "Nie znaleziono zlecenia do wysyłki SMS." }, 404);
  if (!job.sms_consent) return json({ error: "Klient nie ma zaznaczonej zgody SMS." }, 400);

  const recipientPhone = normalizePhone(job.sms_recipient_phone || job.phone || "");
  if (!recipientPhone) return json({ error: "Brak numeru telefonu do wysyłki SMS." }, 400);

  const effectiveDueDate = reminderDueDate || job.service_due_date || calculateDueDate(job.installation_date);
  const effectiveCycle = Number.parseInt(String(reminderCycle ?? ''), 10) || 1;
  const message = buildMessage({ ...job, service_due_date: effectiveDueDate, reminder_due_date: effectiveDueDate }, settings);

  try {
    const smsResult = await sendSmsWithSmsApi({ token, to: recipientPhone, message, from: sender });
    await upsertFinalizedCycleLog(adminClient, {
      job_id: job.id,
      client: job.client || job.title || null,
      phone: smsResult.recipientPhone,
      message,
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
      reminder_cycle: effectiveCycle,
      reminder_due_date: effectiveDueDate,
      error_message: null,
    });
    await adminClient.from("jobs").update({ last_sms_sent_at: nowIso, last_sms_status: "provider_sent", last_sms_error: null, sms_recipient_phone: smsResult.recipientPhone }).eq("id", job.id);
    return json({ ok: true, recipientPhone: smsResult.recipientPhone, providerMessageId: smsResult.providerMessageId, providerResponse: smsResult.responseBody });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    await updateSmsLogInsert(adminClient, { job_id: job.id, client: job.client || job.title || null, phone: recipientPhone, message, sms_type: "service_reminder", provider: "smsapi", status: "error", planned_for: nowIso, approved_at: nowIso, approved_by: callerId, created_by: callerId, reminder_cycle: effectiveCycle, reminder_due_date: effectiveDueDate, error_message: errorMessage });
    await adminClient.from("jobs").update({ last_sms_status: "error", last_sms_error: errorMessage, sms_recipient_phone: recipientPhone }).eq("id", job.id);
    return json({ error: errorMessage, recipientPhone }, 500);
  }
}

async function handleManualDeviceSend({ adminClient, callerId, settings, sender, token, nowIso, deviceId, reminderCycle, reminderDueDate }: { adminClient: ReturnType<typeof createClient>; callerId: string; settings: SmsSettings; sender?: string; token: string; nowIso: string; deviceId: string; reminderCycle?: number | string | null; reminderDueDate?: string | null; }) {
  const { data: device, error } = await adminClient
    .from("devices")
    .select("id, source_job_id, model, serial_number, installation_date, contractor:contractors(company_name, phone)")
    .eq("id", deviceId)
    .single();

  if (error || !device) return json({ error: "Nie znaleziono urządzenia do wysyłki SMS." }, 404);

  const contractor = Array.isArray(device.contractor) ? device.contractor[0] : device.contractor;
  const recipientPhone = normalizePhone(String(contractor?.phone || ""));
  if (!recipientPhone) return json({ error: "Urządzenie nie ma numeru telefonu kontrahenta do wysyłki SMS." }, 400);

  const dueDate = reminderDueDate || calculateDueDate(String(device.installation_date || ""));
  const effectiveCycle = Number.parseInt(String(reminderCycle ?? ""), 10) || 1;
  const message = buildMessage({ client: contractor?.company_name || "Kliencie", installation_date: String(device.installation_date || ""), service_due_date: dueDate, reminder_due_date: dueDate, phone: recipientPhone }, settings);

  try {
    const smsResult = await sendSmsWithSmsApi({ token, to: recipientPhone, message, from: sender });
    const linkedJobId = isUuid(String(device.source_job_id || "")) ? String(device.source_job_id) : null;
    await upsertFinalizedCycleLog(adminClient, {
      device_id: device.id,
      job_id: linkedJobId,
      client: contractor?.company_name || null,
      phone: smsResult.recipientPhone,
      message,
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
      reminder_cycle: effectiveCycle,
      reminder_due_date: dueDate,
      error_message: null,
    });
    if (linkedJobId) {
      await adminClient.from("jobs").update({ last_sms_sent_at: nowIso, last_sms_status: "provider_sent", last_sms_error: null, sms_recipient_phone: smsResult.recipientPhone }).eq("id", linkedJobId);
    }
    return json({ ok: true, recipientPhone: smsResult.recipientPhone, providerMessageId: smsResult.providerMessageId, providerResponse: smsResult.responseBody });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    const linkedJobId = isUuid(String(device.source_job_id || "")) ? String(device.source_job_id) : null;
    await updateSmsLogInsert(adminClient, {
      device_id: device.id,
      job_id: linkedJobId,
      client: contractor?.company_name || null,
      phone: recipientPhone,
      message,
      sms_type: "service_reminder",
      provider: "smsapi",
      status: "error",
      planned_for: nowIso,
      approved_at: nowIso,
      approved_by: callerId,
      created_by: callerId,
      reminder_cycle: effectiveCycle,
      reminder_due_date: dueDate,
      error_message: errorMessage,
    });
    if (linkedJobId) {
      await adminClient.from("jobs").update({ last_sms_status: "error", last_sms_error: errorMessage, sms_recipient_phone: recipientPhone }).eq("id", linkedJobId);
    }
    return json({ error: errorMessage, recipientPhone }, 500);
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

function calculateDueDate(installationDate: string) {
  const match = String(installationDate || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  date.setMonth(date.getMonth() + 11);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}.${match[2]}.${match[1]}`;
  return value;
}

function normalizePhone(value: string) {
  const digits = String(value || "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length === 9) return `48${digits}`;
  if (digits.startsWith("48") && digits.length === 11) return digits;
  return digits;
}

function safeJson(value: unknown) {
  try { return JSON.parse(JSON.stringify(value ?? null)); } catch { return { raw: String(value) }; }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function sendSmsWithSmsApi({ token, to, message, from }: { token: string; to: string; message: string; from?: string }): Promise<SmsApiResult> {
  const payload = new URLSearchParams({ to, message, format: "json", encoding: "utf-8" });
  if (from) payload.set("from", from);
  const response = await fetch("https://api.smsapi.pl/sms.do", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: payload });
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
  const jobId = isUuid(String(payload.job_id || "")) ? String(payload.job_id) : null;
  const deviceId = isUuid(String(payload.device_id || "")) ? String(payload.device_id) : null;
  const cycle = Number.parseInt(String(payload.reminder_cycle ?? ""), 10) || 1;
  const status = String(payload.status || "").trim().toLowerCase() || "sent";

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
