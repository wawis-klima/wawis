import { createClient } from "npm:@supabase/supabase-js@2";

type ReceiptStage = "received" | "displayed";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Brakuje konfiguracji serwera." }, 500);
    }

    const body = await request.json().catch(() => ({}));
    const deliveryLogId = String(body?.deliveryLogId || "").trim();
    const receiptToken = String(body?.receiptToken || "").trim();
    const stage = String(body?.stage || "").trim() as ReceiptStage;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deliveryLogId)) {
      return json({ error: "Nieprawidłowy identyfikator potwierdzenia." }, 400);
    }
    if (receiptToken.length < 32 || receiptToken.length > 128) {
      return json({ error: "Nieprawidłowy token potwierdzenia." }, 400);
    }
    if (stage !== "received" && stage !== "displayed") {
      return json({ error: "Nieprawidłowy etap potwierdzenia." }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const tokenHash = await sha256Hex(receiptToken);
    const { data: row, error: lookupError } = await adminClient
      .from("push_delivery_log")
      .select("id, received_at, displayed_at")
      .eq("id", deliveryLogId)
      .eq("receipt_token_hash", tokenHash)
      .maybeSingle();

    if (lookupError) return json({ error: lookupError.message }, 500);
    if (!row) return json({ error: "Nie znaleziono potwierdzenia." }, 404);

    const now = new Date().toISOString();
    const patch: Record<string, string> = { receipt_updated_at: now };
    if (!row.received_at) patch.received_at = now;
    if (stage === "displayed" && !row.displayed_at) patch.displayed_at = now;

    const { error: updateError } = await adminClient
      .from("push_delivery_log")
      .update(patch)
      .eq("id", deliveryLogId)
      .eq("receipt_token_hash", tokenHash);

    if (updateError) return json({ error: updateError.message }, 500);
    return json({
      ok: true,
      stage,
      receivedAt: row.received_at || patch.received_at || null,
      displayedAt: row.displayed_at || patch.displayed_at || null,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
