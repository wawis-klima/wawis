import { createClient } from "npm:@supabase/supabase-js@2.105.4";

const UUG_ENDPOINT = "https://services.gugik.gov.pl/uug";
const LOOKUP_TIMEOUT_MS = 8_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Dozwolona jest wyłącznie metoda POST." }, 405);

  try {
    const body = await request.json();
    const city = normalizeText(body?.city);
    const street = normalizeText(body?.street);

    if (!city) return json({ error: "Podaj miejscowość." }, 400);
    if (city.length > 160 || street.length > 220) return json({ error: "Adres jest zbyt długi." }, 400);

    const fullQuery = [city, street].filter(Boolean).join(", ");
    const result = await queryUug(fullQuery);
    const gugikPostalCode = normalizePostalCode(result?.code);

    if (gugikPostalCode) {
      return json({
        postalCode: gugikPostalCode,
        city: normalizeText(result?.city) || city,
        street: normalizeText(result?.street) || street,
        number: normalizeText(result?.number),
        accuracy: normalizeText(result?.accuracy),
        fallback: false,
        matched: true,
        source: "GUGiK UUG",
      });
    }

    const historicalPostalCode = await lookupHistoricalPostalCode(city);
    if (historicalPostalCode) {
      return json({
        postalCode: historicalPostalCode,
        city,
        street,
        fallback: true,
        matched: true,
        source: "WAWIS / wcześniej zweryfikowany adres",
      });
    }

    return json({
      postalCode: "",
      city,
      street,
      fallback: true,
      matched: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message || "Nie udało się wyszukać kodu pocztowego." }, 502);
  }
});

async function queryUug(address: string): Promise<Record<string, unknown> | null> {
  const url = new URL(UUG_ENDPOINT);
  url.searchParams.set("request", "GetAddress");
  url.searchParams.set("address", address);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Usługa adresowa GUGiK zwróciła błąd ${response.status}.`);
    const payload = await response.json() as Record<string, unknown>;
    const results = payload?.results && typeof payload.results === "object"
      ? Object.values(payload.results as Record<string, unknown>)
      : [];
    return (results.find((item) => normalizePostalCode((item as Record<string, unknown>)?.code)) as Record<string, unknown> | undefined)
      || (results[0] as Record<string, unknown> | undefined)
      || null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Usługa adresowa GUGiK nie odpowiedziała w wymaganym czasie.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function lookupHistoricalPostalCode(city: string): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = readSupabaseKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
  if (!supabaseUrl || !serviceRoleKey) return "";

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const normalizedCity = normalizeComparableCity(city);
  if (!normalizedCity) return "";

  const { data, error } = await adminClient
    .from("contractors")
    .select("city")
    .ilike("city", `%${city}%`)
    .limit(100);

  if (error || !Array.isArray(data)) return "";

  const counts = new Map<string, number>();
  for (const row of data) {
    const stored = splitPostalCity(row?.city);
    if (!stored.postalCode || normalizeComparableCity(stored.city) !== normalizedCity) continue;
    counts.set(stored.postalCode, (counts.get(stored.postalCode) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "pl"))[0]?.[0] || "";
}

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

function splitPostalCity(value: unknown): { postalCode: string; city: string } {
  const text = normalizeText(value);
  const match = text.match(/^(\d{2}-\d{3})\s+(.+)$/);
  return match
    ? { postalCode: match[1], city: normalizeText(match[2]) }
    : { postalCode: "", city: text };
}

function normalizeComparableCity(value: unknown): string {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pl-PL")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizePostalCode(value: unknown): string {
  const text = normalizeText(value);
  const direct = text.match(/\b\d{2}-\d{3}\b/);
  if (direct) return direct[0];
  const digits = text.replace(/\D+/g, "");
  return digits.length === 5 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : "";
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
