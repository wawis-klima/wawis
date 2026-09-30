import { createClient } from "npm:@supabase/supabase-js@2.105.4";

type SyncInvoiceClientRequest = {
  jobId?: string;
};

type FakturowniaClient = {
  id?: number | string;
  name?: string;
  tax_no?: string;
  email?: string;
  phone?: string;
  city?: string;
  street?: string;
  external_id?: string | number;
};

const FAKTUROWNIA_DOMAIN = "wawis.fakturownia.pl";
const FAKTUROWNIA_BASE_URL = `https://${FAKTUROWNIA_DOMAIN}`;
const PROVIDER_TIMEOUT_MS = 12_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Dozwolona jest wyłącznie metoda POST." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = readSupabaseKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
    const serviceRoleKey = readSupabaseKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
    const apiToken = normalizeText(Deno.env.get("FAKTUROWNIA_API_TOKEN"));

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return json({ error: "Brakuje konfiguracji Supabase dla integracji Fakturowni." }, 500);
    }
    if (!apiToken) {
      return json({ error: "Integracja Fakturowni nie jest skonfigurowana. Brakuje FAKTUROWNIA_API_TOKEN." }, 503);
    }

    const authHeader = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return json({ error: "Sesja wygasła. Zaloguj się ponownie." }, 401);
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError) return json({ error: "Nie udało się sprawdzić uprawnień użytkownika." }, 500);
    const role = normalizeText(profile?.role);
    if (!["Administrator", "admin"].includes(role)) {
      return json({ error: "Tylko administrator może otwierać wystawianie faktur." }, 403);
    }

    const body = (await request.json()) as SyncInvoiceClientRequest;
    const jobId = normalizeText(body.jobId);
    if (!isUuid(jobId)) return json({ error: "Brak prawidłowego identyfikatora montażu." }, 400);

    const { data: job, error: jobError } = await adminClient
      .from("jobs")
      .select("id, contractor_id, client, title, email, phone, city, street")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError || !job) return json({ error: "Nie znaleziono montażu." }, 404);

    let contractor: Record<string, unknown> | null = null;
    const contractorId = normalizeText(job.contractor_id);
    if (contractorId) {
      const { data, error } = await adminClient
        .from("contractors")
        .select("id, company_name, contact_person, phone, email, city, street, nip, addresses")
        .eq("id", contractorId)
        .maybeSingle();
      if (error) return json({ error: "Nie udało się pobrać danych kontrahenta." }, 500);
      contractor = data;
    }

    const clientName = normalizeText(contractor?.company_name || job.client || job.title);
    if (!clientName) return json({ error: "Klient nie ma nazwy potrzebnej do Fakturowni." }, 400);

    const address = getPrimaryAddress(contractor);
    const storedCity = normalizeText(address.city || contractor?.city || job.city);
    const cityParts = splitPostalCity(storedCity);
    const clientData = compactObject({
      name: clientName,
      tax_no: digitsOnly(contractor?.nip),
      email: normalizeEmail(contractor?.email || job.email),
      phone: normalizeText(contractor?.phone || job.phone),
      post_code: cityParts.postalCode,
      city: cityParts.city,
      street: normalizeText(address.street || contractor?.street || job.street),
      country: "PL",
      person: normalizeText(contractor?.contact_person),
      external_id: contractorId || `job-${jobId}`,
    });

    const externalId = String(clientData.external_id || "");
    let matchedClient = firstClient(await fakturowniaGetClients(apiToken, { external_id: externalId }));
    let matchSource = matchedClient ? "external_id" : "";

    const taxNo = digitsOnly(clientData.tax_no);
    if (!matchedClient && taxNo) {
      const candidates = await fakturowniaGetClients(apiToken, { tax_no: taxNo });
      matchedClient = exactClient(candidates, "tax_no", taxNo);
      if (matchedClient) matchSource = "tax_no";
    }

    const email = normalizeEmail(clientData.email);
    if (!matchedClient && email) {
      const candidates = await fakturowniaGetClients(apiToken, { email });
      matchedClient = exactClient(candidates, "email", email);
      if (matchedClient) matchSource = "email";
    }

    let savedClient: FakturowniaClient;
    let created = false;

    if (matchedClient?.id) {
      savedClient = await fakturowniaRequest<FakturowniaClient>(
        `/clients/${encodeURIComponent(String(matchedClient.id))}.json`,
        apiToken,
        {
          method: "PUT",
          body: { client: clientData },
        },
      );
    } else {
      created = true;
      savedClient = await fakturowniaRequest<FakturowniaClient>(
        "/clients.json",
        apiToken,
        {
          method: "POST",
          body: { client: clientData },
        },
      );
    }

    const clientId = normalizeText(savedClient?.id || matchedClient?.id);
    if (!clientId) return json({ error: "Fakturownia nie zwróciła identyfikatora klienta." }, 502);

    // Formularz pozostaje po stronie Fakturowni. API służy tu wyłącznie do synchronizacji klienta,
    // żeby samo kliknięcie nie tworzyło dokumentu ani numeru faktury.
    const invoiceUrl = `${FAKTUROWNIA_BASE_URL}/invoices/new?client_id=${encodeURIComponent(clientId)}`;
    const clientUrl = `${FAKTUROWNIA_BASE_URL}/clients/${encodeURIComponent(clientId)}`;

    return json({
      ok: true,
      clientId,
      clientName,
      created,
      matchSource: matchSource || (created ? "created" : "unknown"),
      invoiceUrl,
      clientUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message || "Nie udało się połączyć z Fakturowią." }, 500);
  }
});

async function fakturowniaGetClients(apiToken: string, params: Record<string, string>): Promise<FakturowniaClient[]> {
  const query = new URLSearchParams(params);
  const result = await fakturowniaRequest<unknown>(`/clients.json?${query.toString()}`, apiToken, { method: "GET" });
  return Array.isArray(result) ? result as FakturowniaClient[] : [];
}

async function fakturowniaRequest<T>(
  path: string,
  apiToken: string,
  options: { method: "GET" | "POST" | "PUT"; body?: Record<string, unknown> },
): Promise<T> {
  const url = new URL(path, FAKTUROWNIA_BASE_URL);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  let body: string | undefined;
  if (options.method === "GET") {
    url.searchParams.set("api_token", apiToken);
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({
      api_token: apiToken,
      ...(options.body || {}),
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: options.method,
      headers,
      body,
      signal: controller.signal,
    });
    const payload = await safeResponseJson(response);
    if (!response.ok) {
      const providerMessage = normalizeText(
        (payload as Record<string, unknown>)?.message
        || (payload as Record<string, unknown>)?.error
        || response.statusText,
      );
      throw new Error(`Fakturownia odrzuciła operację (${response.status})${providerMessage ? `: ${providerMessage}` : "."}`);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Fakturownia nie odpowiedziała w wymaganym czasie.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function firstClient(rows: FakturowniaClient[]): FakturowniaClient | null {
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function exactClient(rows: FakturowniaClient[], field: "tax_no" | "email", expected: string): FakturowniaClient | null {
  const normalizedExpected = field === "tax_no" ? digitsOnly(expected) : normalizeEmail(expected);
  return rows.find((row) => {
    const actual = field === "tax_no" ? digitsOnly(row?.[field]) : normalizeEmail(row?.[field]);
    return actual && actual === normalizedExpected;
  }) || null;
}

function getPrimaryAddress(contractor: Record<string, unknown> | null): { city: string; street: string } {
  const addresses = Array.isArray(contractor?.addresses) ? contractor?.addresses as Array<Record<string, unknown>> : [];
  const primary = addresses.find((item) => item?.is_primary === true) || addresses[0] || null;
  return {
    city: normalizeText(primary?.city),
    street: normalizeText(primary?.street),
  };
}

function compactObject(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== null && value !== undefined && normalizeText(value) !== ""),
  );
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

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function splitPostalCity(value: unknown): { postalCode: string; city: string } {
  const text = normalizeText(value);
  const match = text.match(/^(\d{2}-\d{3})\s+(.+)$/);
  return match
    ? { postalCode: match[1], city: normalizeText(match[2]) }
    : { postalCode: "", city: text };
}


function normalizeEmail(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function digitsOnly(value: unknown): string {
  return normalizeText(value).replace(/\D+/g, "");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function safeResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { status: response.status, statusText: response.statusText };
  }
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
