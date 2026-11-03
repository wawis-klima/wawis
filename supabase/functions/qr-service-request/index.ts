// WAWIS 14.20 — publiczna strona naklejki QR: informacje o urządzeniu i zgłoszenie awarii/przeglądu.
// Funkcja bez logowania (verify_jwt = false). Zwraca wyłącznie bezpieczne dane (firma, telefon firmy,
// model, data montażu, termin przeglądu) — nigdy nazwiska, adresu ani historii klienta.
// Zgłoszenie: walidacja, pole-pułapka, limity (naklejka, adres IP, całość), zapis, push do administratorów.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { buildAdminPush, buildPublicInfo, normalizeCode, rateLimitError, validateSubmission, warsawToday } from "./logic.ts";
import { sendAdminPush } from "./push.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const IP_SALT = "wawis-qr-service-request-v1420";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Nieobsługiwane żądanie." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Usługa chwilowo niedostępna." }, 503);
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const raw = await request.text();
    if (raw.length > 8000) return json({ error: "Zgłoszenie jest za długie." }, 413);
    let body: Record<string, unknown> | null = null;
    try { body = JSON.parse(raw); } catch { body = null; }
    if (!body || typeof body !== "object") return json({ error: "Nieprawidłowe żądanie." }, 400);

    const code = normalizeCode(body.code);
    if (!code) return json({ error: "Nieznana naklejka." }, 404);
    const { data: sticker, error: stickerError } = await adminClient
      .from("qr_stickers").select("code, device_id").eq("code", code).maybeSingle();
    if (stickerError) return json({ error: "Usługa chwilowo niedostępna." }, 503);
    if (!sticker) return json({ error: "Nieznana naklejka." }, 404);

    let device: { id: string; model: string | null; installation_date: string | null; contractor_id: string | null } | null = null;
    if (sticker.device_id) {
      const { data } = await adminClient.from("devices")
        .select("id, model, installation_date, contractor_id").eq("id", sticker.device_id).maybeSingle();
      device = data || null;
    }
    const { data: settings } = await adminClient.from("sms_settings")
      .select("company_name, service_phone").order("updated_at", { ascending: false }).limit(1).maybeSingle();

    const action = String(body.action || "info");
    if (action === "info") {
      return json(buildPublicInfo({ code, device, settings, todayIso: warsawToday() }));
    }
    if (action !== "submit") return json({ error: "Nieobsługiwane żądanie." }, 400);

    const validation = validateSubmission(body);
    if (!validation.ok) return json({ error: validation.error, field: validation.field }, 422);

    const ipHash = await hashIp(request);
    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    const since1h = new Date(Date.now() - 3600_000).toISOString();
    const count = async (build: (q: any) => any) => {
      const { count: n, error } = await build(adminClient.from("service_requests").select("id", { count: "exact", head: true }));
      if (error) throw new Error("Nie udało się sprawdzić limitu zgłoszeń.");
      return Number(n || 0);
    };
    const counts = {
      perCode: await count((q) => q.eq("qr_code", code).gte("created_at", since24h)),
      perIp: ipHash ? await count((q) => q.eq("ip_hash", ipHash).gte("created_at", since24h)) : 0,
      global: await count((q) => q.gte("created_at", since1h)),
    };
    const limited = rateLimitError(counts);
    if (limited) return json({ error: limited }, 429);

    const { data: inserted, error: insertError } = await adminClient.from("service_requests").insert({
      qr_code: code,
      device_id: device?.id || null,
      contractor_id: device?.contractor_id || null,
      kind: validation.value.kind,
      description: validation.value.description,
      phone: validation.value.phone,
      ip_hash: ipHash || null,
    }).select("id").single();
    if (insertError || !inserted?.id) return json({ error: "Nie udało się zapisać zgłoszenia. Zadzwoń do nas." }, 500);

    let contractor: { company_name?: string | null; city?: string | null } | null = null;
    if (device?.contractor_id) {
      const { data } = await adminClient.from("contractors").select("company_name, city").eq("id", device.contractor_id).maybeSingle();
      contractor = data || null;
    }
    const message = buildAdminPush({
      kind: validation.value.kind, model: device?.model, contractorName: contractor?.company_name,
      city: contractor?.city, phone: validation.value.phone, description: validation.value.description,
    });
    let pushDelivered = 0;
    try {
      const push = await sendAdminPush({
        adminClient, webpush,
        vapid: {
          publicKey: Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY") || "",
          privateKey: Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") || "",
          subject: Deno.env.get("WEB_PUSH_VAPID_SUBJECT") || "mailto:admin@example.com",
        },
        receiptEndpoint: `${supabaseUrl.replace(/\/$/, "")}/functions/v1/push-delivery-receipt`,
        eventKey: `service_request:${inserted.id}`,
        logType: "service_request",
        title: message.title,
        body: message.body,
        tag: `service-request-${inserted.id}`,
        url: "/",
      });
      pushDelivered = push.delivered;
    } catch (error) {
      console.warn("Powiadomienie o zgłoszeniu nie zostało wysłane.", error instanceof Error ? error.message : String(error));
    }
    if (pushDelivered) {
      await adminClient.from("service_requests").update({ push_delivered: pushDelivered }).eq("id", inserted.id);
    }
    // Zgłoszenie zapisane = sukces dla klienta, niezależnie od powiadomienia (lista na komputerze je pokaże).
    return json({ ok: true });
  } catch (error) {
    console.error("qr-service-request", error instanceof Error ? error.message : String(error));
    return json({ error: "Usługa chwilowo niedostępna. Zadzwoń do nas." }, 500);
  }
});

async function hashIp(request: Request): Promise<string> {
  const forwarded = request.headers.get("x-forwarded-for") || request.headers.get("cf-connecting-ip") || "";
  const ip = forwarded.split(",")[0].trim();
  if (!ip) return "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${IP_SALT}:${ip}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
