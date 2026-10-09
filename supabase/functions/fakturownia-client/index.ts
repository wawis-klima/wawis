import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import { buildJobInvoiceOid, findIssuedVatInvoiceForJob, inspectManualInvoiceMatch } from "./invoice-match.js";

type SyncInvoiceClientRequest = {
  action?: "prepare" | "verify" | "link_by_number";
  jobId?: string;
  clientId?: string | number;
  invoiceNumber?: string;
};

type FakturowniaClient = {
  id?: number | string;
  name?: string;
  first_name?: string;
  last_name?: string;
  company?: boolean | number | string;
  tax_no?: string;
  email?: string;
  phone?: string;
  city?: string;
  street?: string;
  external_id?: string | number;
};

type FakturowniaInvoice = {
  id?: number | string;
  number?: string;
  kind?: string;
  status?: string;
  client_id?: number | string;
  oid?: string;
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
    const action = normalizeText(body.action || "prepare").toLowerCase();

    if (action === "verify") {
      const jobId = normalizeText(body.jobId);
      const clientId = normalizeText(body.clientId);
      if (!isUuid(jobId)) return json({ error: "Brak prawidłowego identyfikatora montażu do weryfikacji." }, 400);
      if (!clientId) return json({ error: "Brak identyfikatora klienta Fakturowni do weryfikacji." }, 400);

      const invoiceOid = buildJobInvoiceOid(jobId);
      const invoices = await fakturowniaGetInvoices(apiToken, {
        oid: invoiceOid,
        page: "1",
        per_page: "100",
        order: "updated_at.desc",
      });
      const foundInvoice = findIssuedVatInvoiceForJob(invoices, { jobId, clientId });
      const sameOid = invoices.filter((invoice) => normalizeText(invoice?.oid) === invoiceOid);
      const reason = foundInvoice
        ? ""
        : sameOid.some((invoice) => normalizeText(invoice.client_id) !== clientId)
          ? "Znaleziono fakturę z identyfikatorem montażu, ale przypisano ją do innego klienta. Sprawdź dane w Fakturowni."
          : sameOid.length
            ? "Znaleziony dokument nie jest wystawioną fakturą VAT. Sprawdź rodzaj i status dokumentu."
            : "Nie znaleziono wystawionej faktury z identyfikatorem tego montażu. Jeśli dokument już istnieje, użyj opcji „Powiąż po numerze”.";
      return json({
        ok: true,
        found: Boolean(foundInvoice?.id),
        reason,
        reasonCode: foundInvoice ? "VERIFIED" : sameOid.length ? "MISMATCH" : "OID_NOT_FOUND",
        invoiceOid,
        invoiceId: normalizeText(foundInvoice?.id),
        invoiceNumber: normalizeText(foundInvoice?.number),
        invoiceStatus: normalizeText(foundInvoice?.status),
        invoiceKind: normalizeText(foundInvoice?.kind),
      });
    }

    if (action === "link_by_number") {
      const jobId = normalizeText(body.jobId);
      const invoiceNumber = normalizeText(body.invoiceNumber);
      if (!isUuid(jobId)) return json({ error: "Nieprawidłowy identyfikator montażu." }, 400);
      if (!invoiceNumber || invoiceNumber.length > 100) return json({ error: "Podaj prawidłowy numer faktury (maksymalnie 100 znaków)." }, 400);

      const { data: job, error: jobError } = await adminClient
        .from("jobs")
        .select("id, contractor_id, status, vat_invoice_fakturownia_confirmed")
        .eq("id", jobId)
        .maybeSingle();
      if (jobError || !job) return json({ error: "Nie znaleziono montażu." }, 404);
      if (job.status !== "Zakończone") return json({ error: "Fakturę można powiązać tylko z zakończonym montażem." }, 400);
      if (job.vat_invoice_fakturownia_confirmed) return json({ error: "Ta karta ma już potwierdzoną fakturę. Powiązania nie można zmienić." }, 409);

      // Tożsamość klienta pochodzi z bazy WAWIS, nigdy z clientId podanego przez przeglądarkę.
      const expectedExternalId = normalizeText(job.contractor_id) || `job-${jobId}`;
      const candidates = await fakturowniaGetClients(apiToken, { external_id: expectedExternalId });
      const clients = candidates.filter((client) =>
        normalizeText(client?.external_id) === expectedExternalId && normalizeText(client?.id));
      if (clients.length !== 1) {
        return json({ ok: true, found: false, reasonCode: "CLIENT_NOT_LINKED",
          reason: "Nie udało się jednoznacznie powiązać klienta WAWIS z kartoteką Fakturowni. Otwórz najpierw „Wystaw fakturę” dla tego montażu lub popraw kartotekę." });
      }
      const trustedClientId = normalizeText(clients[0].id);
      const invoices = await fakturowniaGetInvoices(apiToken, {
        number: invoiceNumber, page: "1", per_page: "100",
      });
      // Fakturownia może ograniczyć wynik. Bez kompletności nie wolno stwierdzić unikatowości.
      if (invoices.length >= 100) return json({ error: "Wyszukiwanie zwróciło zbyt wiele faktur. Zweryfikuj numer bezpośrednio w Fakturowni." }, 409);
      const exactMatches = invoices.filter((invoice) => normalizeText(invoice?.number) === invoiceNumber);
      if (exactMatches.length > 1) return json({ ok: true, found: false, reasonCode: "DUPLICATE_NUMBER",
        reason: "Znaleziono więcej niż jedną fakturę o tym numerze. Powiązanie zostało zablokowane." });
      const invoice = exactMatches[0] || null;
      const verdict = inspectManualInvoiceMatch(invoice, {
        jobId, clientId: trustedClientId, invoiceNumber,
      });
      if (!verdict.ok) return json({ ok: true, found: false, reasonCode: verdict.code, reason: verdict.reason });

      return json({
        ok: true, found: true, reasonCode: "VERIFIED",
        invoiceId: normalizeText(invoice?.id),
        invoiceNumber: normalizeText(invoice?.number),
        invoiceStatus: normalizeText(invoice?.status),
        invoiceKind: normalizeText(invoice?.kind),
      });
    }

    if (action !== "prepare") return json({ error: "Nieznana operacja integracji Fakturowni." }, 400);

    const jobId = normalizeText(body.jobId);
    if (!isUuid(jobId)) return json({ error: "Brak prawidłowego identyfikatora montażu." }, 400);

    const { data: job, error: jobError } = await adminClient
      .from("jobs")
      .select("id, contractor_id, client, title, email, phone, city, street, device_model, payment_method")
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
    const taxNo = digitsOnly(contractor?.nip);
    const isCompany = Boolean(taxNo);
    const personName = splitPrivatePersonName(clientName);
    const invoiceBrand = detectInvoiceBrand(job.device_model);
    const invoicePositionName = invoiceBrand
      ? `Dostawa i montaż klimatyzatora marki ${invoiceBrand}`
      : "Dostawa i montaż klimatyzatora";
    const invoiceTax = isCompany ? 23 : 8;
    const invoicePayment = getInvoicePaymentPrefill(job.payment_method);
    const clientData = compactObject({
      name: clientName,
      first_name: isCompany ? "" : personName.firstName,
      last_name: isCompany ? "" : personName.lastName,
      company: isCompany,
      tax_no: taxNo,
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
    const externalCandidates = await fakturowniaGetClients(apiToken, { external_id: externalId });
    const matchingExternal = externalCandidates.filter(
      (row) => normalizeText(row?.external_id) === externalId && normalizeText(row?.id),
    );
    if (matchingExternal.length > 1) {
      throw new Error("Fakturownia zwróciła kilka kartotek z tym samym external_id. Wymagana ręczna weryfikacja.");
    }
    let matchedClient: FakturowniaClient | null = matchingExternal[0] || null;
    let matchSource = matchedClient ? "external_id" : "";

    if (matchedClient && taxNo && digitsOnly(matchedClient.tax_no) && digitsOnly(matchedClient.tax_no) !== taxNo) {
      throw new Error("Kartoteka external_id ma inny NIP. Zatrzymano synchronizację klienta.");
    }

    if (!matchedClient && taxNo) {
      const candidates = await fakturowniaGetClients(apiToken, { tax_no: taxNo });
      const exactMatches = candidates.filter((row) => digitsOnly(row?.tax_no) === taxNo && normalizeText(row?.id));
      if (exactMatches.length > 1) {
        throw new Error("Kilka kartotek ma ten sam NIP. Wymagana ręczna weryfikacja.");
      }
      if (exactMatches.length) {
        const candidate = exactMatches[0];
        const linkedExternalId = normalizeText(candidate.external_id);
        if (linkedExternalId && linkedExternalId !== externalId) {
          throw new Error("Kartoteka o podanym NIP jest powiązana z innym kontrahentem. Wymagana ręczna weryfikacja.");
        }
        matchedClient = candidate;
        matchSource = "tax_no";
      }
    }

    // E-mail może być wspólny dla kilku klientów; nigdy nie identyfikuje kartoteki do PUT.
    const email = normalizeEmail(clientData.email);
    if (!matchedClient && email) {
      const candidates = await fakturowniaGetClients(apiToken, { email });
      if (candidates.some((row) => normalizeEmail(row?.email) === email)) {
        throw new Error("W Fakturowni istnieje kartoteka z tym adresem e-mail. Powiąż klienta ręcznie przez external_id lub zweryfikuj NIP.");
      }
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

    // Formularz pozostaje po stronie Fakturowni. Każdy montaż dostaje własny OID,
    // dzięki czemu późniejsza weryfikacja nie zgaduje po "pierwszej nowej fakturze klienta".
    const invoiceOid = buildJobInvoiceOid(jobId);
    const invoiceUrl = buildInvoiceFormUrl({
      clientId,
      invoiceOid,
      positionName: invoicePositionName,
      tax: invoiceTax,
      paymentType: invoicePayment.paymentType,
      paymentToKind: invoicePayment.paymentToKind,
      status: invoicePayment.status,
    });
    const clientUrl = `${FAKTUROWNIA_BASE_URL}/clients/${encodeURIComponent(clientId)}`;

    return json({
      ok: true,
      clientId,
      clientName,
      created,
      matchSource: matchSource || (created ? "created" : "unknown"),
      invoiceOid,
      invoiceUrl,
      clientUrl,
      invoicePrefill: {
        brand: invoiceBrand,
        positionName: invoicePositionName,
        tax: invoiceTax,
        paymentType: invoicePayment.paymentType,
        paymentToKind: invoicePayment.paymentToKind,
        status: invoicePayment.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message || "Nie udało się połączyć z Fakturowią." }, 500);
  }
});

async function fakturowniaGetClients(apiToken: string, params: Record<string, string>): Promise<FakturowniaClient[]> {
  const query = new URLSearchParams(params);
  const result = await fakturowniaRequest<unknown>(`/clients.json?${query.toString()}`, apiToken, { method: "GET" });
  if (!Array.isArray(result) || !result.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
    throw new Error("Nieprawidłowa odpowiedź listy klientów Fakturowni. Zatrzymano synchronizację.");
  }
  return result as FakturowniaClient[];
}

async function fakturowniaGetInvoices(apiToken: string, params: Record<string, string>): Promise<FakturowniaInvoice[]> {
  const query = new URLSearchParams(params);
  const result = await fakturowniaRequest<unknown>(`/invoices.json?${query.toString()}`, apiToken, { method: "GET" });
  if (!Array.isArray(result) || !result.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
    throw new Error("Nieprawidłowa odpowiedź listy faktur Fakturowni. Zatrzymano weryfikację.");
  }
  return result as FakturowniaInvoice[];
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

function getPrimaryAddress(contractor: Record<string, unknown> | null): { city: string; street: string } {
  const addresses = Array.isArray(contractor?.addresses) ? contractor?.addresses as Array<Record<string, unknown>> : [];
  const primary = addresses.find((item) => item?.is_primary === true) || addresses[0] || null;
  return {
    city: normalizeText(primary?.city),
    street: normalizeText(primary?.street),
  };
}


type InvoicePaymentPrefill = {
  paymentType: "" | "cash" | "transfer";
  paymentToKind: "" | "off" | "3";
  status: "" | "paid" | "issued";
};

function getInvoicePaymentPrefill(value: unknown): InvoicePaymentPrefill {
  const method = normalizeText(value).toLowerCase();
  if (method === "cash") {
    return { paymentType: "cash", paymentToKind: "off", status: "paid" };
  }
  if (method === "transfer") {
    return { paymentType: "transfer", paymentToKind: "3", status: "issued" };
  }
  return { paymentType: "", paymentToKind: "", status: "" };
}

function detectInvoiceBrand(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return "";

  const brands: Array<[RegExp, string]> = [
    [/\bMitsubishi\s+Heavy(?:\s+Industries)?\b/i, "Mitsubishi Heavy Industries"],
    [/\bMitsubishi\s+Electric\b/i, "Mitsubishi Electric"],
    [/\bRotenso\b/i, "Rotenso"],
    [/\bDaikin\b/i, "Daikin"],
    [/\bSamsung\b/i, "Samsung"],
    [/\bGree\b/i, "Gree"],
    [/\bKaisai\b/i, "Kaisai"],
    [/\bHaier\b/i, "Haier"],
    [/\bPanasonic\b/i, "Panasonic"],
    [/\bToshiba\b/i, "Toshiba"],
    [/\bFujitsu\b/i, "Fujitsu"],
    [/\bHitachi\b/i, "Hitachi"],
    [/\bHisense\b/i, "Hisense"],
    [/\bSinclair\b/i, "Sinclair"],
    [/\bMidea\b/i, "Midea"],
    [/\bAUX\b/i, "AUX"],
    [/\bLG\b/i, "LG"],
    [/\bMitsubishi\b/i, "Mitsubishi Electric"],
  ];

  return brands.find(([pattern]) => pattern.test(text))?.[1] || "";
}

function buildInvoiceFormUrl({
  clientId,
  invoiceOid,
  positionName,
  tax,
  paymentType,
  paymentToKind,
  status,
}: {
  clientId: string;
  invoiceOid: string;
  positionName: string;
  tax: number;
  paymentType: string;
  paymentToKind: string;
  status: string;
}): string {
  const url = new URL("/invoices/new", FAKTUROWNIA_BASE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("invoice[oid]", invoiceOid);

  // Te parametry wyłącznie wstępnie uzupełniają formularz WWW.
  // Nie wysyłamy POST /invoices.json, więc samo kliknięcie w WAWIS nie tworzy dokumentu.
  url.searchParams.set("invoice[positions][0][name]", positionName);
  url.searchParams.set("invoice[positions][0][tax]", String(tax));

  if (paymentType) url.searchParams.set("invoice[payment_type]", paymentType);
  if (paymentToKind) url.searchParams.set("invoice[payment_to_kind]", paymentToKind);
  if (status) url.searchParams.set("invoice[status]", status);

  return url.toString();
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

function splitPrivatePersonName(value: unknown): { firstName: string; lastName: string } {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
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
