import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ACTIVE_WINDOW_DAYS = 62;
const DEFAULT_REMINDER_YEARS = 5;
const DEVICE_PAGE_SIZE = 1000;
const JOB_ID_BATCH_SIZE = 100;
const SMS_LOG_PAGE_SIZE = 1000;
const DEVICE_SELECT = "id, contractor_id, source_job_id, model, serial_number, installation_date, service_reminder_years, sms_consent, sms_reminder_enabled, contractor:contractors(company_name, phone)";
const JOB_SELECT = "id, client, title, phone, sms_recipient_phone, sms_consent, sms_reminder_enabled, service_reminder_years";
const SMS_LOG_SELECT = "id, job_id, device_id, client, phone, message, status, provider, provider_message_id, sent_at, delivered_at, error_message, reminder_cycle, reminder_due_date, reminder_group_id, reminder_group_primary, created_at";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) return json({ error: "Brakuje konfiguracji Supabase." }, 500);

    const authHeader = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Brak autoryzacji użytkownika." }, 401);

    const { data: callerProfile, error: profileError } = await adminClient.from("profiles").select("id, role").eq("id", authData.user.id).single();
    if (profileError || !callerProfile || !isAdminRole(callerProfile.role)) return json({ error: "Tylko administrator może odświeżać listę SMS." }, 403);

    const { data: settingsRow } = await adminClient.from("sms_settings").select("is_enabled, service_phone, company_name, template_service_reminder").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const settings = {
      is_enabled: settingsRow?.is_enabled ?? true,
      service_phone: settingsRow?.service_phone ?? null,
      company_name: settingsRow?.company_name ?? "Wawis Klimatyzacja",
      template_service_reminder: settingsRow?.template_service_reminder || "Dzień dobry {client}, przypominamy o obowiązkowym przeglądzie klimatyzacji po 11 miesiącach od montażu. Aby utrzymać gwarancję, prosimy o kontakt: {service_phone}. {company_name}",
    };
    if (!settings.is_enabled) return json({ ok: true, createdCount: 0, skipped: "disabled" });

    const now = new Date();
    const nowIso = now.toISOString();
    const todayIso = getWarsawIsoDate(now);
    const todayDay = isoDateToDay(todayIso);

    const devices = await fetchAllServiceReminderDevices(adminClient);

    const linkedJobIds = [...new Set(
      (devices || [])
        .map((device) => normalizeSourceJobId(device.source_job_id))
        .filter((value) => isUuid(value)),
    )].sort();

    const jobsById = new Map<string, {
      id: string;
      client: string | null;
      title: string | null;
      phone: string | null;
      sms_recipient_phone: string | null;
      sms_consent: boolean | null;
      sms_reminder_enabled: boolean | null;
      service_reminder_years: number | null;
    }>();

    const linkedJobs = await fetchJobsByIds(adminClient, linkedJobIds);
    for (const job of linkedJobs) jobsById.set(String(job.id), job);

    const logs = await fetchAllServiceReminderLogs(adminClient);

    const existingByKey = new Map<string, {
      id: string;
      status: string;
      groupId: string;
      deviceId: string;
      jobId: string;
      client: string;
      phone: string;
      message: string;
      provider: string;
      errorMessage: string;
      cycle: number;
      dueDate: string;
      primary: boolean;
      hasProviderProof: boolean;
      createdAt: string;
    }>();
    const existingPrimaryGroupIds = new Set<string>();

    for (const log of logs || []) {
      const identity = log.device_id ? `device:${log.device_id}` : log.job_id ? `job:${log.job_id}` : "";
      const cycle = Number.parseInt(String(log.reminder_cycle ?? ""), 10) || 1;
      const groupId = String(log.reminder_group_id || "").trim();

      if (identity) {
        const key = `${identity}:${cycle}`;
        const candidate = {
          id: String(log.id || ""),
          status: String(log.status || ""),
          groupId,
          deviceId: String(log.device_id || ""),
          jobId: String(log.job_id || ""),
          client: String(log.client || ""),
          phone: String(log.phone || ""),
          message: String(log.message || ""),
          provider: String(log.provider || ""),
          errorMessage: String(log.error_message || ""),
          cycle,
          dueDate: String(log.reminder_due_date || ""),
          primary: log.reminder_group_primary === true,
          hasProviderProof: Boolean(log.provider_message_id || log.sent_at || log.delivered_at),
          createdAt: String(log.created_at || ""),
        };
        const current = existingByKey.get(key);
        const candidateTime = Date.parse(candidate.createdAt) || 0;
        const currentTime = Date.parse(current?.createdAt || "") || 0;
        const shouldReplace = !current
          || (candidate.hasProviderProof && !current.hasProviderProof)
          || (candidate.hasProviderProof === current.hasProviderProof && candidate.primary && !current.primary)
          || (
            candidate.hasProviderProof === current.hasProviderProof
            && candidate.primary === current.primary
            && candidateTime >= currentTime
          );
        if (shouldReplace) existingByKey.set(key, candidate);
      }

      if (groupId && log.reminder_group_primary === true) {
        existingPrimaryGroupIds.add(groupId);
      }
    }

    let createdCount = 0;
    let expiredCount = 0;
    let refreshedCount = 0;
    let skippedOrphanCount = 0;
    const queueItems: Array<{ item: Record<string, unknown>; identities: string[] }> = [];

    for (const device of devices || []) {
      const contractor = Array.isArray(device.contractor) ? device.contractor[0] : device.contractor;
      const rawSourceJobId = String(device.source_job_id || "").trim();
      const linkedJobId = normalizeSourceJobId(device.source_job_id);
      const linkedJob = linkedJobId ? jobsById.get(linkedJobId) || null : null;
      const isLegacyDevice = !rawSourceJobId;

      if (rawSourceJobId && (!linkedJobId || !linkedJob)) {
        skippedOrphanCount += 1;
        continue;
      }

      const phone = normalizePhone(String(
        linkedJob
          ? (linkedJob.sms_recipient_phone || linkedJob.phone || "")
          : (contractor?.phone || "")
      ));
      const smsConsent = linkedJob ? linkedJob.sms_consent === true : device.sms_consent === true;
      const smsReminderEnabled = linkedJob ? linkedJob.sms_reminder_enabled === true : device.sms_reminder_enabled === true;
      const reminderYears = Math.max(
        1,
        Number.parseInt(String(
          linkedJob?.service_reminder_years
            ?? device.service_reminder_years
            ?? DEFAULT_REMINDER_YEARS
        ), 10) || DEFAULT_REMINDER_YEARS,
      );
      const schedule = getReminderSchedule(String(device.installation_date || ""), reminderYears);

      if (!schedule.length || !phone || !smsConsent || !smsReminderEnabled) continue;
      if (isLegacyDevice && !device.contractor_id) {
        skippedOrphanCount += 1;
        continue;
      }

      for (const item of schedule) {
        if (item.dueDay > todayDay) break;

        queueItems.push({
          item: {
            deviceId: device.id,
            jobId: linkedJobId || null,
            cycle: item.cycle,
            dueDate: item.dueDate,
            dueDay: item.dueDay,
            expiresOn: item.expiresOn,
            expiresDay: item.expiresDay,
            installationDate: String(device.installation_date || ""),
            client: linkedJob?.client || linkedJob?.title || contractor?.company_name || null,
            phone,
          },
          identities: [`device:${device.id}`],
        });
      }
    }

    async function insertQueueItem(item: Record<string, unknown>, identities: string[]) {
      const cycle = Number.parseInt(String(item.cycle ?? ""), 10) || 1;
      const dueDate = String(item.dueDate || "").trim();
      const phone = normalizePhone(String(item.phone || ""));
      if (!phone || !dueDate) return;

      const existing = identities
        .map((identity) => existingByKey.get(`${identity}:${cycle}`))
        .find(Boolean);
      const existingStatus = String(existing?.status || "").trim().toLowerCase();
      const retryableProviderError = Boolean(existing && existingStatus === "error" && existing.hasProviderProof !== true);
      if (existing && !["pending_approval", "not_sent"].includes(existingStatus) && !retryableProviderError) return;

      const message = buildMessage({
        client: item.client || "Kliencie",
        phone,
        installation_date: String(item.installationDate || ""),
        service_due_date: dueDate,
      }, settings);

      const targetStatus = todayDay <= Number(item.expiresDay || 0) ? "pending_approval" : "not_sent";
      const targetErrorMessage = targetStatus === "not_sent"
        ? "Przekroczono 62-dniowe okno wysyłki przypomnienia."
        : "";
      if (
        existing
        && existing.primary
        && existing.groupId
        && existing.deviceId === String(item.deviceId || "")
        && existing.jobId === String(item.jobId || "")
        && existing.client === String(item.client || "")
        && normalizePhone(existing.phone) === phone
        && existing.message === message
        && existing.provider === "smsapi"
        && existing.errorMessage === targetErrorMessage
        && existing.cycle === cycle
        && existing.dueDate === dueDate
        && existingStatus === targetStatus
      ) return;

      const reminderGroupId = await ensureServiceSmsGroup(
        adminClient,
        phone,
        dueDate,
        String(item.deviceId || "").trim() || null,
        String(item.jobId || "").trim() || null,
      );
      const payload = {
        device_id: item.deviceId || null,
        job_id: item.jobId || null,
        client: item.client || null,
        phone,
        message,
        sms_type: "service_reminder",
        provider: "smsapi",
        reminder_cycle: cycle,
        reminder_due_date: dueDate,
        reminder_group_id: reminderGroupId,
        reminder_group_primary: true,
        planned_for: nowIso,
        created_by: callerProfile.id,
        status: targetStatus,
        error_message: targetErrorMessage || null,
      } as Record<string, unknown>;

      if (existing) {
        if (existing.groupId !== reminderGroupId && existingPrimaryGroupIds.has(reminderGroupId)) {
          const { data: obsoleteRows, error: obsoleteError } = await adminClient
            .from("sms_log")
            .update({
              status: "deleted",
              reminder_group_primary: false,
              error_message: "Pozycja zastąpiona aktualną grupą klienta po zmianie danych.",
            })
            .eq("id", existing.id)
            .in("status", ["pending_approval", "not_sent", "error"])
            .is("provider_message_id", null)
            .is("sent_at", null)
            .is("delivered_at", null)
            .select("id");
          if (obsoleteError) throw new Error(`Nie udało się wygasić nieaktualnej pozycji SMS: ${obsoleteError.message}`);
          if (!Array.isArray(obsoleteRows) || obsoleteRows.length === 0) return;
          if (existing.groupId) existingPrimaryGroupIds.delete(existing.groupId);
          for (const identity of identities) {
            existingByKey.set(`${identity}:${cycle}`, { ...existing, status: "deleted", primary: false });
          }
          return;
        }

        const { data: updatedRows, error: updateError } = await adminClient
          .from("sms_log")
          .update(payload)
          .eq("id", existing.id)
          .in("status", ["pending_approval", "not_sent", "error"])
          .is("provider_message_id", null)
          .is("sent_at", null)
          .is("delivered_at", null)
          .select("id");

        if (updateError) {
          if (String(updateError.code || "") === "23505") {
            const { data: fallbackRows, error: fallbackError } = await adminClient
              .from("sms_log")
              .update({
                status: "deleted",
                reminder_group_primary: false,
                error_message: "Pozycja zastąpiona aktualną grupą klienta po zmianie danych.",
              })
              .eq("id", existing.id)
              .in("status", ["pending_approval", "not_sent", "error"])
              .is("provider_message_id", null)
              .is("sent_at", null)
              .is("delivered_at", null)
              .select("id");
            if (fallbackError) throw new Error(`Nie udało się wygasić konfliktującej pozycji SMS: ${fallbackError.message}`);
            if (Array.isArray(fallbackRows) && fallbackRows.length > 0) {
              existingPrimaryGroupIds.add(reminderGroupId);
            }
            return;
          }
          throw new Error(`Nie udało się odświeżyć pozycji kolejki SMS: ${updateError.message}`);
        }

        if (!Array.isArray(updatedRows) || updatedRows.length === 0) return;

        if (existing.groupId && existing.groupId !== reminderGroupId) {
          existingPrimaryGroupIds.delete(existing.groupId);
        }
        existingPrimaryGroupIds.add(reminderGroupId);
        for (const identity of identities) {
          existingByKey.set(`${identity}:${cycle}`, {
            id: existing.id,
            status: targetStatus,
            groupId: reminderGroupId,
            deviceId: String(item.deviceId || ""),
            jobId: String(item.jobId || ""),
            client: String(item.client || ""),
            phone,
            message,
            provider: "smsapi",
            errorMessage: targetErrorMessage,
            cycle,
            dueDate,
            primary: true,
            hasProviderProof: false,
          createdAt: nowIso,
          });
        }
        refreshedCount += 1;
        return;
      }

      if (existingPrimaryGroupIds.has(reminderGroupId)) return;

      const { error: insertError } = await adminClient.from("sms_log").insert(payload);
      if (insertError) {
        if (String(insertError.code || "") === "23505") {
          existingPrimaryGroupIds.add(reminderGroupId);
          return;
        }
        throw new Error(`Nie udało się zapisać grupy kolejki SMS: ${insertError.message}`);
      }

      existingPrimaryGroupIds.add(reminderGroupId);
      for (const identity of identities) {
        existingByKey.set(`${identity}:${cycle}`, {
          id: crypto.randomUUID(),
          status: targetStatus,
          groupId: reminderGroupId,
          deviceId: String(item.deviceId || ""),
          jobId: String(item.jobId || ""),
          client: String(item.client || ""),
          phone,
          message,
          provider: "smsapi",
          errorMessage: targetErrorMessage,
          cycle,
          dueDate,
          primary: true,
          hasProviderProof: false,
        createdAt: nowIso,
        });
      }

      if (targetStatus === "pending_approval") createdCount += 1;
      else expiredCount += 1;
    }

    queueItems.sort((a, b) => Number(a.item.dueDay || 0) - Number(b.item.dueDay || 0));

    for (const entry of queueItems) {
      await insertQueueItem(entry.item, entry.identities);
    }

    return json({ ok: true, createdCount, expiredCount, refreshedCount, skippedOrphanCount });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});



async function ensureServiceSmsGroup(
  adminClient: ReturnType<typeof createClient>,
  phone: string,
  dueDate: string,
  deviceId: string | null,
  jobId: string | null,
) {
  const { data, error } = await adminClient.rpc("ensure_service_sms_group_v2", {
    p_phone: phone,
    p_due_date: dueDate,
    p_device_id: deviceId,
    p_job_id: jobId,
  });

  if (error) {
    throw new Error(`Nie udało się utworzyć trwałej grupy przypomnienia SMS: ${error.message}`);
  }

  const groupId = String(data || "").trim();
  if (!isUuid(groupId)) {
    throw new Error("Baza nie zwróciła prawidłowego identyfikatora grupy SMS.");
  }

  return groupId;
}

async function fetchAllServiceReminderDevices(
  adminClient: ReturnType<typeof createClient>,
) {
  const devices: Array<Record<string, any>> = [];

  for (let from = 0; ; from += DEVICE_PAGE_SIZE) {
    const { data, error } = await adminClient
      .from("devices")
      .select(DEVICE_SELECT)
      .not("installation_date", "is", null)
      .order("id", { ascending: true })
      .range(from, from + DEVICE_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Nie udało się pobrać urządzeń do kolejki SMS: ${error.message}`);
    }

    const page = data || [];
    devices.push(...page);
    if (page.length < DEVICE_PAGE_SIZE) break;
  }

  return devices;
}

async function fetchJobsByIds(
  adminClient: ReturnType<typeof createClient>,
  jobIds: string[],
) {
  const jobs: Array<Record<string, any>> = [];

  for (let from = 0; from < jobIds.length; from += JOB_ID_BATCH_SIZE) {
    const batch = jobIds.slice(from, from + JOB_ID_BATCH_SIZE);
    const { data, error } = await adminClient
      .from("jobs")
      .select(JOB_SELECT)
      .in("id", batch)
      .order("id", { ascending: true });

    if (error) {
      throw new Error(`Nie udało się pobrać zleceń powiązanych z kolejką SMS: ${error.message}`);
    }

    jobs.push(...(data || []));
  }

  return jobs;
}

async function fetchAllServiceReminderLogs(
  adminClient: ReturnType<typeof createClient>,
) {
  const logs: Array<Record<string, unknown>> = [];

  for (let from = 0; ; from += SMS_LOG_PAGE_SIZE) {
    const { data, error } = await adminClient
      .from("sms_log")
      .select(SMS_LOG_SELECT)
      .eq("sms_type", "service_reminder")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + SMS_LOG_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Nie udało się pobrać historii kolejki SMS: ${error.message}`);
    }

    const page = data || [];
    logs.push(...page);
    if (page.length < SMS_LOG_PAGE_SIZE) break;
  }

  return logs;
}

function isAdminRole(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "administrator" || normalized === "admin";
}

function buildMessage(target: Record<string, unknown>, settings: Record<string, unknown>) {
  const template = String(settings.template_service_reminder || "");
  const client = String(target.client || target.title || "Kliencie");
  const installationDate = formatDate(String(target.installation_date || ""));
  const serviceDueDate = formatDate(String(target.service_due_date || ""));
  const servicePhone = String(settings.service_phone || target.phone || "");
  const companyName = String(settings.company_name || "Wawis Klimatyzacja");
  return template.replaceAll("{client}", client).replaceAll("{installation_date}", installationDate).replaceAll("{service_due_date}", serviceDueDate).replaceAll("{service_phone}", servicePhone).replaceAll("{company_name}", companyName);
}

function formatDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}.${match[2]}.${match[1]}`;
  return value;
}

function normalizePhone(value: string) {
  const raw = String(value || "").trim();
  if (!raw || !/^[0-9+()\s.-]+$/.test(raw)) return "";
  let digits = raw.replace(/\D+/g, "");
  if (digits.length === 13 && digits.startsWith("0048")) digits = digits.slice(2);
  else if (digits.length === 9) digits = `48${digits}`;
  return digits.length === 11 && digits.startsWith("48") ? digits : "";
}

function normalizeSourceJobId(value: unknown) {
  const source = String(value || "").trim().split("::")[0] || "";
  return isUuid(source) ? source : "";
}

function parseIsoDateParts(value: unknown) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatIsoParts(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addMonthsClampedIso(value: unknown, monthsToAdd: number) {
  const parts = parseIsoDateParts(value);
  if (!parts) return "";
  const zeroBased = (parts.year * 12) + (parts.month - 1) + monthsToAdd;
  const year = Math.floor(zeroBased / 12);
  const month = (zeroBased % 12) + 1;
  const day = Math.min(parts.day, daysInMonth(year, month));
  return formatIsoParts(year, month, day);
}

function isoDateToDay(value: unknown) {
  const parts = parseIsoDateParts(value);
  if (!parts) return 0;
  return Math.trunc(Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000);
}

function addDaysIso(value: unknown, days: number) {
  const dayNumber = isoDateToDay(value);
  if (!dayNumber) return "";
  const date = new Date((dayNumber + days) * 86400000);
  return formatIsoParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function getWarsawIsoDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const read = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function getReminderSchedule(installationDate: string, reminderYears = DEFAULT_REMINDER_YEARS) {
  if (!parseIsoDateParts(installationDate)) return [];
  const schedule: Array<{ cycle: number; dueDate: string; dueDay: number; expiresOn: string; expiresDay: number }> = [];
  for (let cycle = 1; cycle <= reminderYears; cycle += 1) {
    const dueDate = addMonthsClampedIso(installationDate, 11 + ((cycle - 1) * 12));
    if (!dueDate) continue;
    const expiresOn = addDaysIso(dueDate, ACTIVE_WINDOW_DAYS);
    schedule.push({
      cycle,
      dueDate,
      dueDay: isoDateToDay(dueDate),
      expiresOn,
      expiresDay: isoDateToDay(expiresOn),
    });
  }
  return schedule;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
