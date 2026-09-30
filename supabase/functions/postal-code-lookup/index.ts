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
    let result = await queryUug(fullQuery);
    let fallback = false;

    if (!normalizePostalCode(result?.code) && street) {
      result = await queryUug(city);
      fallback = true;
    }

    const postalCode = normalizePostalCode(result?.code);
    if (!postalCode) {
      return json({
        postalCode: "",
        city,
        street,
        fallback,
        matched: false,
      });
    }

    return json({
      postalCode,
      city: normalizeText(result?.city) || city,
      street: normalizeText(result?.street) || street,
      number: normalizeText(result?.number),
      accuracy: normalizeText(result?.accuracy),
      fallback,
      matched: true,
      source: "GUGiK UUG",
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
