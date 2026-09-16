import { createClient } from "npm:@supabase/supabase-js@2.105.4";

type ProtocolEmailRequest = {
  jobId?: string;
  protocolId?: string;
  recipientEmail?: string;
  requestKey?: string;
};

type ProtocolRow = {
  id: string;
  job_id: string;
  storage_path: string;
  file_name: string;
  file_size_bytes: number;
  signed_at: string;
};

const FROM_EMAIL = "biuro@wawis.pl";
const FROM_HEADER = `WAWIS Klimatyzacja <${FROM_EMAIL}>`;
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const MAX_PROTOCOL_SIZE = 10 * 1024 * 1024;
const RATE_LIMIT_SECONDS = 30;
const PROVIDER_TIMEOUT_MS = 12_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Dozwolona jest wyłącznie wysyłka POST." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = readSupabaseKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
    const serviceRoleKey = readSupabaseKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
    const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return json({ error: "Brakuje konfiguracji Supabase dla wysyłki protokołu." }, 500);
    }
    if (!resendApiKey) {
      return json({ error: "Wysyłka firmowa nie jest jeszcze aktywna. Brakuje sekretu RESEND_API_KEY." }, 503);
    }

    const authHeader = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Sesja wygasła. Zaloguj się ponownie." }, 401);

    const body = (await request.json()) as ProtocolEmailRequest;
    const jobId = normalizeText(body.jobId);
    const protocolId = normalizeText(body.protocolId);
    const requestedRecipient = normalizeEmail(body.recipientEmail);
    const requestKey = normalizeText(body.requestKey);

    if (!isUuid(jobId) || !isUuid(protocolId) || !isUuid(requestKey)) {
      return json({ error: "Brakuje prawidłowych danych protokołu do wysłania." }, 400);
    }

    const { data: job, error: jobError } = await userClient
      .from("jobs")
      .select("id, client, title, email, city, street, installation_date, status")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError || !job) return json({ error: "Nie masz dostępu do tego zlecenia." }, 403);
    if (normalizeText(job.status) !== "Zakończone") {
      return json({ error: "Protokół można wysłać dopiero po zakończeniu zlecenia." }, 400);
    }

    const jobRecipient = normalizeEmail(job.email);
    if (!isValidEmail(jobRecipient)) return json({ error: "W zleceniu nie ma prawidłowego adresu e-mail klienta." }, 400);
    if (requestedRecipient !== jobRecipient) {
      return json({ error: "Protokół można wysłać wyłącznie na adres klienta zapisany w zleceniu." }, 403);
    }

    const { data: protocol, error: protocolError } = await userClient
      .from("job_protocols")
      .select("id, job_id, storage_path, file_name, file_size_bytes, signed_at")
      .eq("id", protocolId)
      .eq("job_id", jobId)
      .maybeSingle();

    if (protocolError || !protocol) return json({ error: "Nie znaleziono podpisanego protokołu do wysłania." }, 404);
    if (Number(protocol.file_size_bytes || 0) <= 0 || Number(protocol.file_size_bytes) > MAX_PROTOCOL_SIZE) {
      return json({ error: "Plik protokołu ma nieprawidłowy rozmiar." }, 400);
    }

    const { data: existingLog, error: existingLogError } = await adminClient
      .from("job_protocol_email_log")
      .select("id, request_key, job_id, protocol_id, recipient_email, sender_email, status, sent_by, provider_message_id, sent_at, error_message, created_at")
      .eq("request_key", requestKey)
      .maybeSingle();

    if (existingLogError) {
      return json({ error: `Nie udało się sprawdzić poprzedniej próby wysyłki. ${existingLogError.message}` }, 500);
    }
    if (existingLog) {
      const sameAttempt = String(existingLog.job_id) === jobId
        && String(existingLog.protocol_id) === protocolId
        && normalizeEmail(existingLog.recipient_email) === jobRecipient
        && String(existingLog.sent_by || '') === String(authData.user.id);
      if (!sameAttempt) {
        return json({ error: "Klucz próby jest już przypisany do innej wysyłki.", definitive: true, requestKey }, 409);
      }
      if (existingLog.status === "sent") {
        return json({
          ok: true,
          reconciled: true,
          requestKey,
          recipientEmail: jobRecipient,
          senderEmail: FROM_EMAIL,
          sentAt: existingLog.sent_at,
          providerMessageId: existingLog.provider_message_id,
        });
      }
      if (existingLog.status === "failed") {
        return json({
          error: existingLog.error_message || "Poprzednia próba została jednoznacznie odrzucona.",
          definitive: true,
          requestKey,
        }, 409);
      }
    }

    if (!existingLog) {
      const rateLimitAfter = new Date(Date.now() - RATE_LIMIT_SECONDS * 1000).toISOString();
      const { data: recentSend } = await adminClient
        .from("job_protocol_email_log")
        .select("id, status, recipient_email, created_at")
        .eq("job_id", jobId)
        .eq("sent_by", authData.user.id)
        .gte("created_at", rateLimitAfter)
        .in("status", ["sending", "sent"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentSend) {
        return json({ error: "Protokół został właśnie wysłany. Odczekaj chwilę przed nową, świadomą wysyłką.", definitive: true }, 429);
      }
    }

    let emailLog = existingLog;
    if (!emailLog) {
      const nowIso = new Date().toISOString();
      const logRow = {
        request_key: requestKey,
        job_id: jobId,
        protocol_id: protocolId,
        recipient_email: jobRecipient,
        sender_email: FROM_EMAIL,
        provider: "resend",
        status: "sending",
        sent_by: authData.user.id,
        created_at: nowIso,
      };
      const { data: insertedLog, error: logError } = await adminClient
        .from("job_protocol_email_log")
        .insert(logRow)
        .select("id, request_key, job_id, protocol_id, recipient_email, status, sent_by")
        .single();

      if (logError || !insertedLog) {
        if (String(logError?.code || "") === "23505") {
          return json({ error: "Ta sama próba została rozpoczęta równolegle. Ponów z tym samym kluczem.", pending: true, requestKey }, 409);
        }
        return json({ error: `Nie udało się rozpocząć wysyłki protokołu. ${logError?.message || ""}`.trim() }, 500);
      }
      emailLog = insertedLog;
    }

    try {
      const { data: pdfBlob, error: downloadError } = await adminClient.storage
        .from("job-protocols")
        .download((protocol as ProtocolRow).storage_path);
      if (downloadError || !pdfBlob) throw new Error("Nie udało się pobrać zapisanego protokołu PDF.");

      const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
      if (!pdfBytes.length || pdfBytes.length > MAX_PROTOCOL_SIZE) throw new Error("Plik protokołu ma nieprawidłowy rozmiar.");

      const clientName = normalizeText(job.client || job.title) || "Klient";
      const address = [normalizeText(job.city), normalizeText(job.street)].filter(Boolean).join(", ");
      const subject = `Protokół montażu klimatyzacji – ${clientName}`;
      const providerController = new AbortController();
      const providerTimeout = setTimeout(() => providerController.abort(), PROVIDER_TIMEOUT_MS);
      let resendResponse: Response;
      try {
        resendResponse = await fetch(RESEND_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `wawis-protocol-${requestKey}`,
          },
          signal: providerController.signal,
          body: JSON.stringify({
            from: FROM_HEADER,
            reply_to: FROM_EMAIL,
            to: [jobRecipient],
            subject,
            html: buildHtml({ clientName, address, installationDate: job.installation_date }),
            text: buildText({ clientName, address, installationDate: job.installation_date }),
            attachments: [{
              filename: safePdfFileName((protocol as ProtocolRow).file_name),
              content: bytesToBase64(pdfBytes),
            }],
            tags: [
              { name: "source", value: "wawis_protocol" },
              { name: "job_id", value: jobId },
              { name: "protocol_id", value: protocolId },
            ],
          }),
        });
      } catch (providerError) {
        const providerUnknown = truncate(`provider_result_unknown: ${providerError instanceof Error ? providerError.message : String(providerError)}`, 1200);
        await adminClient.from("job_protocol_email_log").update({
          status: "sending",
          error_message: providerUnknown,
        }).eq("id", emailLog.id);
        return json({
          error: "Serwer pocztowy nie potwierdził wyniku. Ponów wysyłkę — zostanie użyty ten sam klucz próby.",
          pending: true,
          providerResultUnknown: true,
          requestKey,
        }, 504);
      } finally {
        clearTimeout(providerTimeout);
      }

      const providerBody = await safeResponseJson(resendResponse);
      if (!resendResponse.ok) {
        const rejection = truncate(normalizeText((providerBody as Record<string, unknown>)?.message) || `Serwer pocztowy odrzucił wysyłkę (${resendResponse.status}).`, 1200);
        await adminClient.from("job_protocol_email_log").update({
          status: "failed",
          provider_response: safeJson(providerBody),
          error_message: rejection,
        }).eq("id", emailLog.id);
        return json({ error: rejection, definitive: true, requestKey }, 502);
      }

      const providerMessageId = normalizeText((providerBody as Record<string, unknown>)?.id) || null;
      const sentAt = new Date().toISOString();
      const { error: sentLogError } = await adminClient.from("job_protocol_email_log").update({
        status: "sent",
        provider_message_id: providerMessageId,
        provider_response: safeJson(providerBody),
        error_message: null,
        sent_at: sentAt,
      }).eq("id", emailLog.id);

      if (sentLogError) {
        return json({
          error: "Wiadomość została przyjęta przez dostawcę, ale zapis potwierdzenia nie powiódł się. Ponów — użyjemy tego samego klucza.",
          pending: true,
          providerResultUnknown: true,
          requestKey,
          providerMessageId,
        }, 503);
      }

      return json({
        ok: true,
        requestKey,
        recipientEmail: jobRecipient,
        senderEmail: FROM_EMAIL,
        sentAt,
        providerMessageId,
      });
    } catch (error) {
      const errorMessage = truncate(error instanceof Error ? error.message : String(error), 1200);
      await adminClient.from("job_protocol_email_log").update({
        status: "failed",
        error_message: errorMessage,
      }).eq("id", emailLog.id);
      return json({ error: errorMessage, definitive: true, requestKey }, 502);
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

function readSupabaseKey(legacyName: string, dictionaryName: string): string {
  const legacy = Deno.env.get(legacyName) || "";
  if (legacy) return legacy;
  try {
    const dictionary = JSON.parse(Deno.env.get(dictionaryName) || "{}") as Record<string, string>;
    return normalizeText(dictionary.default || Object.values(dictionary)[0]);
  } catch {
    return "";
  }
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeEmail(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function escapeHtml(value: unknown): string {
  return normalizeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: unknown): string {
  const text = normalizeText(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : text || "—";
}

function buildHtml({ clientName, address, installationDate }: { clientName: string; address: string; installationDate: unknown }): string {
  return `<!doctype html><html lang="pl"><body style="margin:0;background:#f4f7f9;color:#243746;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #dfe7ec;border-radius:16px;padding:26px"><h1 style="margin:0 0 18px;font-size:22px;color:#142a3a">Protokół montażu klimatyzacji</h1><p>Dzień dobry,</p><p>w załączniku przesyłamy podpisany protokół zakończenia montażu klimatyzacji.</p><table style="width:100%;margin:20px 0;border-collapse:collapse"><tr><td style="padding:7px 0;color:#647783">Klient</td><td style="padding:7px 0;font-weight:700">${escapeHtml(clientName)}</td></tr><tr><td style="padding:7px 0;color:#647783">Adres</td><td style="padding:7px 0;font-weight:700">${escapeHtml(address || "—")}</td></tr><tr><td style="padding:7px 0;color:#647783">Data montażu</td><td style="padding:7px 0;font-weight:700">${escapeHtml(formatDate(installationDate))}</td></tr></table><p style="margin:22px 0 0">Pozdrawiamy,<br><strong>WAWIS Chłodnictwo i Klimatyzacja</strong><br>Piotr Wasik<br>tel. 606 553 984<br><a href="mailto:${FROM_EMAIL}" style="color:#176b4d">${FROM_EMAIL}</a></p></div></div></body></html>`;
}

function buildText({ clientName, address, installationDate }: { clientName: string; address: string; installationDate: unknown }): string {
  return [
    "Dzień dobry,",
    "",
    "w załączniku przesyłamy podpisany protokół zakończenia montażu klimatyzacji.",
    "",
    `Klient: ${clientName}`,
    `Adres: ${address || "—"}`,
    `Data montażu: ${formatDate(installationDate)}`,
    "",
    "Pozdrawiamy,",
    "WAWIS Chłodnictwo i Klimatyzacja",
    "Piotr Wasik",
    "tel. 606 553 984",
    FROM_EMAIL,
  ].join("\n");
}

function safePdfFileName(value: unknown): string {
  const fileName = normalizeText(value).replace(/[\\/:*?"<>|\r\n]+/g, "-").slice(0, 180);
  return fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName || "wawis-protokol"}.pdf`;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return btoa(chunks.join(""));
}

async function safeResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { status: response.status, statusText: response.statusText };
  }
}

function safeJson(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}
