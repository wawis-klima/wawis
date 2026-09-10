import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ACTIVE_WINDOW_DAYS = 62;
const DEFAULT_REMINDER_YEARS = 5;

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
    const cleanupResult = await cleanupDuplicateSmsLogs(adminClient);

    const { data: devices, error: devicesError } = await adminClient
      .from("devices")
      .select("id, source_job_id, model, serial_number, installation_date, contractor:contractors(company_name, phone)")
      .not("installation_date", "is", null);
    if (devicesError) return json({ error: devicesError.message }, 400);

    const linkedJobIds = (devices || [])
      .map((device) => String(device.source_job_id || "").trim())
      .filter((value) => isUuid(value));

    const jobsById = new Map<string, { id: string; client: string | null; title: string | null; phone: string | null; sms_recipient_phone: string | null; sms_consent: boolean | null; sms_reminder_enabled: boolean | null; service_reminder_years: number | null; }>();
    if (linkedJobIds.length) {
      const { data: jobs, error: jobsError } = await adminClient
        .from("jobs")
        .select("id, client, title, phone, sms_recipient_phone, sms_consent, sms_reminder_enabled, service_reminder_years")
        .in("id", linkedJobIds);
      if (jobsError) return json({ error: jobsError.message }, 400);
      for (const job of jobs || []) {
        jobsById.set(String(job.id), job);
      }
    }

    const { data: logs, error: logsError } = await adminClient
      .from("sms_log")
      .select("id, job_id, device_id, client, phone, status, reminder_cycle, reminder_due_date")
      .eq("sms_type", "service_reminder")
      .limit(5000);
    if (logsError) return json({ error: logsError.message }, 400);

    const existingByKey = new Map<string, { id: string; status: string }>();
    const existingCustomerByKey = new Map<string, { id: string; status: string }>();
    for (const log of logs || []) {
      const identity = log.device_id ? `device:${log.device_id}` : log.job_id ? `job:${log.job_id}` : "";
      const cycle = Number.parseInt(String(log.reminder_cycle ?? ""), 10) || 1;
      if (identity) {
        existingByKey.set(`${identity}:${cycle}`, { id: log.id, status: String(log.status || "") });
      }
      const customerKey = getCustomerQueueKey({ phone: log.phone, client: log.client, dueDate: log.reminder_due_date, cycle });
      if (customerKey) {
        existingCustomerByKey.set(customerKey, { id: log.id, status: String(log.status || "") });
      }
    }

    let createdCount = 0;
    let expiredCount = 0;
    const groupedByJobCycle = new Map<string, Record<string, unknown>>();
    const standaloneItems: Array<Record<string, unknown>> = [];

    for (const device of devices || []) {
      const contractor = Array.isArray(device.contractor) ? device.contractor[0] : device.contractor;
      const sourceJobId = String(device.source_job_id || "").trim();
      const linkedJob = jobsById.get(sourceJobId) || null;
      const linkedJobId = isUuid(sourceJobId) ? sourceJobId : "";
      const phone = normalizePhone(String(linkedJob?.sms_recipient_phone || linkedJob?.phone || contractor?.phone || ""));
      const smsConsent = typeof linkedJob?.sms_consent === "boolean" ? linkedJob.sms_consent : true;
      const smsReminderEnabled = typeof linkedJob?.sms_reminder_enabled === "boolean" ? linkedJob.sms_reminder_enabled : true;
      const reminderYears = Math.max(1, Number.parseInt(String(linkedJob?.service_reminder_years ?? DEFAULT_REMINDER_YEARS), 10) || DEFAULT_REMINDER_YEARS);
      const schedule = getReminderSchedule(String(device.installation_date || ""), reminderYears);
      if (!schedule.length || !phone || !smsConsent || !smsReminderEnabled) continue;

      for (const item of schedule) {
        if (item.dueTs > now.getTime()) break;

        if (linkedJobId) {
          const groupKey = `${linkedJobId}:${item.cycle}`;
          const group = groupedByJobCycle.get(groupKey) || {
            key: groupKey,
            jobId: linkedJobId,
            cycle: item.cycle,
            dueDate: item.dueDate,
            dueTs: item.dueTs,
            expiresAt: item.expiresAt,
            installationDate: String(device.installation_date || ""),
            client: linkedJob?.client || linkedJob?.title || contractor?.company_name || null,
            phone,
            identities: [`job:${linkedJobId}`],
          };
          const identities = group.identities as string[];
          const deviceIdentity = `device:${device.id}`;
          if (!identities.includes(deviceIdentity)) identities.push(deviceIdentity);
          if (item.dueTs < Number(group.dueTs || item.dueTs)) {
            group.dueDate = item.dueDate;
            group.dueTs = item.dueTs;
            group.expiresAt = item.expiresAt;
            group.installationDate = String(device.installation_date || "");
          }
          groupedByJobCycle.set(groupKey, group);
          continue;
        }

        standaloneItems.push({
          identity: `device:${device.id}`,
          deviceId: device.id,
          jobId: null,
          cycle: item.cycle,
          dueDate: item.dueDate,
          dueTs: item.dueTs,
          expiresAt: item.expiresAt,
          installationDate: String(device.installation_date || ""),
          client: contractor?.company_name || null,
          phone,
        });
      }
    }

    async function insertQueueItem(item: Record<string, unknown>, identities: string[]) {
      const cycle = Number.parseInt(String(item.cycle ?? ""), 10) || 1;
      const customerKey = getCustomerQueueKey({ phone: item.phone, client: item.client, dueDate: item.dueDate, cycle });
      const alreadyExists = identities.some((identity) => existingByKey.has(`${identity}:${cycle}`)) || Boolean(customerKey && existingCustomerByKey.has(customerKey));
      if (alreadyExists) return;

      const message = buildMessage({
        client: item.client || "Kliencie",
        phone: item.phone,
        installation_date: String(item.installationDate || ""),
        service_due_date: String(item.dueDate || ""),
      }, settings);

      const payload = {
        device_id: item.deviceId || null,
        job_id: item.jobId || null,
        client: item.client || null,
        phone: item.phone,
        message,
        sms_type: "service_reminder",
        provider: "smsapi",
        reminder_cycle: cycle,
        reminder_due_date: item.dueDate,
        planned_for: nowIso,
        created_by: callerProfile.id,
      } as Record<string, unknown>;

      if (now.getTime() <= Number(item.expiresAt || 0)) {
        const { error: insertError } = await adminClient.from("sms_log").insert({ ...payload, status: "pending_approval" });
        if (!insertError) {
          createdCount += 1;
          for (const identity of identities) existingByKey.set(`${identity}:${cycle}`, { id: crypto.randomUUID(), status: "pending_approval" });
          if (customerKey) existingCustomerByKey.set(customerKey, { id: crypto.randomUUID(), status: "pending_approval" });
        }
      } else {
        const { error: insertError } = await adminClient.from("sms_log").insert({ ...payload, status: "not_sent", error_message: "Przekroczono 2-miesięczne okno wysyłki przypomnienia." });
        if (!insertError) {
          expiredCount += 1;
          for (const identity of identities) existingByKey.set(`${identity}:${cycle}`, { id: crypto.randomUUID(), status: "not_sent" });
          if (customerKey) existingCustomerByKey.set(customerKey, { id: crypto.randomUUID(), status: "not_sent" });
        }
      }
    }

    for (const group of groupedByJobCycle.values()) {
      await insertQueueItem({
        ...group,
        jobId: group.jobId,
        deviceId: null,
      }, group.identities as string[]);
    }

    for (const item of standaloneItems) {
      await insertQueueItem(item, [String(item.identity || "")].filter(Boolean));
    }

    return json({ ok: true, createdCount, expiredCount, cleanupResult });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});


async function cleanupDuplicateSmsLogs(adminClient: ReturnType<typeof createClient>) {
  const { data, error } = await adminClient.rpc("admin_cleanup_sms_duplicate_logs");
  if (!error) return data || { ok: true };

  const message = String(error.message || error.details || error.hint || "");
  if (/admin_cleanup_sms_duplicate_logs|function .* does not exist|Could not find the function/i.test(message)) {
    return { ok: true, skipped: true, reason: "missing_rpc" };
  }

  throw new Error(`Nie udało się wyczyścić duplikatów logów SMS: ${message || "nieznany błąd"}`);
}


function normalizeCustomerKeyPart(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pl-PL")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getCustomerQueueKey({ phone, client, dueDate, cycle }: { phone?: unknown; client?: unknown; dueDate?: unknown; cycle?: unknown }) {
  const normalizedDueDate = String(dueDate || "").trim();
  const normalizedCycle = Number.parseInt(String(cycle ?? ""), 10) || 1;
  if (!normalizedDueDate) return "";
  const normalizedPhone = normalizePhone(String(phone || ""));
  if (normalizedPhone) return `phone:${normalizedPhone}:due:${normalizedDueDate}:cycle:${normalizedCycle}`;
  const normalizedClient = normalizeCustomerKeyPart(client);
  return normalizedClient ? `client:${normalizedClient}:due:${normalizedDueDate}:cycle:${normalizedCycle}` : "";
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
  const digits = String(value || "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length === 9) return `48${digits}`;
  if (digits.startsWith("48") && digits.length === 11) return digits;
  return digits;
}

function getReminderSchedule(installationDate: string, reminderYears = DEFAULT_REMINDER_YEARS) {
  const match = String(installationDate || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return [];
  const baseDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  const schedule: Array<{ cycle: number; dueDate: string; dueTs: number; expiresAt: number }> = [];
  for (let cycle = 1; cycle <= reminderYears; cycle += 1) {
    const dueDate = new Date(baseDate.getTime());
    dueDate.setMonth(dueDate.getMonth() + (cycle === 1 ? 11 : 11 + ((cycle - 1) * 12)));
    const iso = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}-${String(dueDate.getDate()).padStart(2, "0")}`;
    schedule.push({ cycle, dueDate: iso, dueTs: dueDate.getTime(), expiresAt: dueDate.getTime() + (ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000) });
  }
  return schedule;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
