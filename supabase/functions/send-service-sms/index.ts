import {\n  sendServiceSmsOnce,\n  SmsAcceptancePersistenceError,\n  SmsDeliveryBlockedError,\n  SmsDeliveryUncertainError,\n  SmsProviderRejectedError,\n} from './delivery.ts';
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

async function handleApprovalSend({ adminClient, callerId, settings, sender, token, nowIso: _nowIso, logIds }: { adminClient: ReturnType<typeof createClient>; callerId: string; settings: SmsSettings; sender?: string; token: string; nowIso: string; logIds: string[]; }) {
  const cleanIds = Array.isArray(logIds) ? logIds.filter(Boolean) : [];
  if (cleanIds.length === 0) return json({ error: "Nie przekazano pozycji z kolejki do wysyłki." }, 400);

  const { data: logs, error } = await adminClient
    .from("sms_log")
    .select("id, job_id, device_id, status, reminder_cycle")
    .in("id", cleanIds);

  if (error) return json({ error: error.message }, 400);

  let sentCount = 0;
  const failures: Array<{ id: string; error: string; outcome: string; retryable: boolean }> = [];

  for (const log of logs || []) {
    if (log.status !== "pending_approval") continue;

    try {
      await sendServiceSmsOnce({
        adminClient,
        actorId: callerId,
        logId: log.id,
        jobId: log.job_id,
        deviceId: log.device_id,
        cycle: log.reminder_cycle || 1,
        prepare: (prepared) => {
          const currentMessage = buildMessage({
            client: prepared.client,
            installation_date: prepared.installationDate,
            service_due_date: prepared.currentDueDate,
            reminder_due_date: prepared.currentDueDate,
            phone: prepared.recipientPhone,
          }, settings);

          return {
            message: currentMessage,
            send: () => sendSmsWithSmsApi({
              token,
              to: prepared.recipientPhone,
              message: currentMessage,
              from: sender,
              idx: toSmsApiIdx(prepared.claimId),
            }),
          };
        },
      });

      sentCount += 1;
    } catch (error) {
      const failure = describeSendFailure(error);
      failures.push({ id: log.id, error: failure.error, outcome: failure.outcome, retryable: failure.retryable });
    }
  }

  return json({
    ok: failures.length === 0,
    sentCount,
    failures,
    outcome: failures.length === 0 ? "sent" : sentCount > 0 ? "partial" : "failed",
  });
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

async function handleManualJobSend({ adminClient, callerId, settings, sender, token, nowIso: _nowIso, jobId, reminderCycle, reminderDueDate: _reminderDueDate }: { adminClient: ReturnType<typeof createClient>; callerId: string; settings: SmsSettings; sender?: string; token: string; nowIso: string; jobId: string; reminderCycle?: number | string | null; reminderDueDate?: string | null; }) {
  const effectiveCycle = Number.parseInt(String(reminderCycle ?? ""), 10) || 1;

  try {
    const smsResult = await sendServiceSmsOnce({
      adminClient,
      actorId: callerId,
      jobId,
      cycle: effectiveCycle,
      prepare: (prepared) => {
        const message = buildMessage({
          client: prepared.client,
          installation_date: prepared.installationDate,
          service_due_date: prepared.currentDueDate,
          reminder_due_date: prepared.currentDueDate,
          phone: prepared.recipientPhone,
        }, settings);

        return {
          message,
          send: () => sendSmsWithSmsApi({
            token,
            to: prepared.recipientPhone,
            message,
            from: sender,
            idx: toSmsApiIdx(prepared.claimId),
          }),
        };
      },
    });

    return json({
      ok: true,
      outcome: "provider_accepted",
      retryable: false,
      recipientPhone: smsResult.recipientPhone,
      providerMessageId: smsResult.providerMessageId,
      providerResponse: smsResult.responseBody,
      reminderDueDate: smsResult.currentDueDate,
      logId: smsResult.logId,
    });
  } catch (error) {
    const failure = describeSendFailure(error);
    return json({ ok: false, ...failure }, failure.httpStatus);
  }
}

async function handleManualDeviceSend({ adminClient, callerId, settings, sender, token, nowIso: _nowIso, deviceId, reminderCycle, reminderDueDate: _reminderDueDate }: { adminClient: ReturnType<typeof createClient>; callerId: string; settings: SmsSettings; sender?: string; token: string; nowIso: string; deviceId: string; reminderCycle?: number | string | null; reminderDueDate?: string | null; }) {
  const effectiveCycle = Number.parseInt(String(reminderCycle ?? ""), 10) || 1;

  try {
    const smsResult = await sendServiceSmsOnce({
      adminClient,
      actorId: callerId,
      deviceId,
      cycle: effectiveCycle,
      prepare: (prepared) => {
        const message = buildMessage({
          client: prepared.client,
          installation_date: prepared.installationDate,
          service_due_date: prepared.currentDueDate,
          reminder_due_date: prepared.currentDueDate,
          phone: prepared.recipientPhone,
        }, settings);

        return {
          message,
          send: () => sendSmsWithSmsApi({
            token,
            to: prepared.recipientPhone,
            message,
            from: sender,
            idx: toSmsApiIdx(prepared.claimId),
          }),
        };
      },
    });

    return json({
      ok: true,
      outcome: "provider_accepted",
      retryable: false,
      recipientPhone: smsResult.recipientPhone,
      providerMessageId: smsResult.providerMessageId,
      providerResponse: smsResult.responseBody,
      reminderDueDate: smsResult.currentDueDate,
      logId: smsResult.logId,
    });
  } catch (error) {
    const failure = describeSendFailure(error);
    return json({ ok: false, ...failure }, failure.httpStatus);
  }
}

function describeSendFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (error instanceof SmsDeliveryBlockedError) {
    return { error: message, outcome: "blocked", retryable: false, httpStatus: 409 };
  }

  if (error instanceof SmsProviderRejectedError) {
    return {
      error: message,
      outcome: "provider_rejected",
      retryable: error.claimReleased,
      httpStatus: 422,
    };
  }

  if (error instanceof SmsAcceptancePersistenceError) {
    return {
      error: message,
      outcome: "provider_accepted_persistence_pending",
      retryable: false,
      httpStatus: 202,
      providerMessageId: error.providerMessageId,
    };
  }

  if (error instanceof SmsDeliveryUncertainError) {
    return {
      error: message,
      outcome: "uncertain",
      retryable: false,
      httpStatus: 202,
    };
  }

  return {
    error: message,
    outcome: "failed_before_provider",
    retryable: true,
    httpStatus: 500,
  };
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function deriveSmsApiCallbackToken(accessToken: string) {
  const source = `wawis:smsapi-callback:v1:${String(accessToken || '')}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function toSmsApiIdx(claimId: string) {
  const compact = String(claimId || "").replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(compact)) {
    throw new Error("Nie udało się przygotować bezpiecznego IDX dla SMSAPI.");
  }
  return compact;
}

function providerErrorMessage(parsed: unknown, statusCode: number) {
  const record = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  const code = record.error != null ? String(record.error) : statusCode ? String(statusCode) : "";
  const message = String(record.message || "").trim();
  return `SMSAPI odrzuciło wiadomość${code ? ` (kod ${code})` : ""}${message ? `: ${message}` : "."}`;
}

async function sendSmsWithSmsApi({ token, to, message, from, idx }: { token: string; to: string; message: string; from?: string; idx: string }): Promise<SmsApiResult> {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  if (!supabaseUrl) throw new Error("Brak SUPABASE_URL do skonfigurowania callbacku SMSAPI.");

  const callbackToken = await deriveSmsApiCallbackToken(token);
  const notifyUrl = `${supabaseUrl}/functions/v1/smsapi-delivery-webhook?auth=${encodeURIComponent(callbackToken)}`;
  const payload = new URLSearchParams({
    to,
    message,
    format: "json",
    encoding: "utf-8",
    notify_url: notifyUrl,
    idx,
    check_idx: "1",
  });
  if (from) payload.set("from", from);

  const response = await fetch("https://api.smsapi.pl/sms.do", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: payload,
    signal: AbortSignal.timeout(20000),
  });

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  const record = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  const invalidNumbers = Array.isArray(record.invalid_numbers) ? record.invalid_numbers : [];
  const hasExplicitProviderError = record.error != null || invalidNumbers.length > 0;

  if (hasExplicitProviderError || (response.status >= 400 && response.status < 500)) {
    throw new SmsProviderRejectedError(
      providerErrorMessage(parsed, response.status),
      parsed,
      response.status,
    );
  }

  if (!response.ok) {
    throw new Error(`SMSAPI zwróciło niepewny błąd HTTP ${response.status}: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`);
  }

  const list = Array.isArray(record.list) ? record.list as Array<Record<string, unknown>> : [];
  const first = list[0] || {};
  if (first.error != null) {
    throw new SmsProviderRejectedError(
      providerErrorMessage(first, response.status),
      parsed,
      response.status,
    );
  }

  const providerMessageId = typeof first.id === "string" ? String(first.id).trim() : "";
  if (!providerMessageId) {
    throw new Error(`SMSAPI nie zwróciło jednoznacznego ID przyjętej wiadomości: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`);
  }

  return {
    providerMessageId,
    responseBody: parsed,
    recipientPhone: to,
  };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
