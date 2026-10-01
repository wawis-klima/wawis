import { createClient } from "npm:@supabase/supabase-js@2.105.4";

const BIR_ENDPOINT = "https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc";
const BIR_NAMESPACE = "http://CIS/BIR/PUBL/2014/07";
const BIR_DATA_NAMESPACE = "http://CIS/BIR/PUBL/2014/07/DataContract";
const WSA_NAMESPACE = "http://www.w3.org/2005/08/addressing";
const SOAP_NAMESPACE = "http://www.w3.org/2003/05/soap-envelope";
const PROVIDER_TIMEOUT_MS = 12_000;

const ACTION_LOGIN = `${BIR_NAMESPACE}/IUslugaBIRzewnPubl/Zaloguj`;
const ACTION_SEARCH = `${BIR_NAMESPACE}/IUslugaBIRzewnPubl/DaneSzukajPodmioty`;

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
    const apiKey = normalizeText(Deno.env.get("GUS_BIR_API_KEY"));

    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: "Brakuje konfiguracji Supabase dla integracji GUS." }, 500);
    }
    if (!apiKey) {
      return json({ error: "Integracja GUS nie jest skonfigurowana. Brakuje GUS_BIR_API_KEY." }, 503);
    }

    const authHeader = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return json({ error: "Sesja wygasła. Zaloguj się ponownie." }, 401);
    }

    const body = await request.json();
    const nip = digitsOnly(body?.nip);
    if (nip.length !== 10) return json({ error: "NIP musi mieć dokładnie 10 cyfr." }, 400);
    if (!isValidPolishNip(nip)) return json({ error: "Podany NIP ma nieprawidłową sumę kontrolną." }, 400);

    const sid = await birLogin(apiKey);
    if (!sid) throw new Error("GUS nie zwrócił identyfikatora sesji.");

    const rawResult = await birSearchByNip({ sid, nip });
    if (!normalizeText(rawResult)) {
      return json({ ok: true, found: false, nip, source: "GUS REGON BIR" });
    }

    const embeddedXml = decodeXmlEntities(decodeXmlEntities(rawResult));
    const name = xmlValue(embeddedXml, "Nazwa");
    if (!name) {
      return json({ ok: true, found: false, nip, source: "GUS REGON BIR" });
    }

    const streetName = xmlValue(embeddedXml, "Ulica");
    const propertyNumber = xmlValue(embeddedXml, "NrNieruchomosci");
    const apartmentNumber = xmlValue(embeddedXml, "NrLokalu");
    const street = [
      streetName,
      propertyNumber
        ? apartmentNumber
          ? `${propertyNumber}/${apartmentNumber}`
          : propertyNumber
        : "",
    ].filter(Boolean).join(" ").trim();

    return json({
      ok: true,
      found: true,
      source: "GUS REGON BIR",
      nip: xmlValue(embeddedXml, "Nip") || nip,
      regon: xmlValue(embeddedXml, "Regon"),
      name,
      postalCode: normalizePostalCode(xmlValue(embeddedXml, "KodPocztowy")),
      city: xmlValue(embeddedXml, "Miejscowosc"),
      street,
      streetName,
      propertyNumber,
      apartmentNumber,
      voivodeship: xmlValue(embeddedXml, "Wojewodztwo"),
      county: xmlValue(embeddedXml, "Powiat"),
      municipality: xmlValue(embeddedXml, "Gmina"),
      statusNip: xmlValue(embeddedXml, "StatusNip"),
      businessEndDate: xmlValue(embeddedXml, "DataZakonczeniaDzialalnosci"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: sanitizeProviderError(message) || "Nie udało się pobrać danych firmy z GUS." }, 502);
  }
});

async function birLogin(apiKey: string): Promise<string> {
  const body = `
    <ns:Zaloguj>
      <ns:pKluczUzytkownika>${escapeXml(apiKey)}</ns:pKluczUzytkownika>
    </ns:Zaloguj>`;
  const responseXml = await birSoapRequest(ACTION_LOGIN, body);
  return normalizeText(xmlValue(responseXml, "ZalogujResult"));
}

async function birSearchByNip({ sid, nip }: { sid: string; nip: string }): Promise<string> {
  const body = `
    <ns:DaneSzukajPodmioty>
      <ns:pParametryWyszukiwania>
        <dat:Nip>${escapeXml(nip)}</dat:Nip>
      </ns:pParametryWyszukiwania>
    </ns:DaneSzukajPodmioty>`;
  const responseXml = await birSoapRequest(ACTION_SEARCH, body, sid);
  return xmlRawValue(responseXml, "DaneSzukajPodmiotyResult");
}

async function birSoapRequest(action: string, body: string, sid = ""): Promise<string> {
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="${SOAP_NAMESPACE}" xmlns:ns="${BIR_NAMESPACE}" xmlns:dat="${BIR_DATA_NAMESPACE}">
  <soap:Header xmlns:wsa="${WSA_NAMESPACE}">
    <wsa:To>${BIR_ENDPOINT}</wsa:To>
    <wsa:Action>${action}</wsa:Action>
  </soap:Header>
  <soap:Body>${body}</soap:Body>
</soap:Envelope>`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/soap+xml; charset=utf-8",
      Accept: "application/soap+xml, text/xml",
      SOAPAction: action,
    };
    if (sid) headers.sid = sid;

    const response = await fetch(BIR_ENDPOINT, {
      method: "POST",
      headers,
      body: envelope,
      signal: controller.signal,
    });
    const responseText = await response.text();
    if (!response.ok) throw new Error(`Usługa GUS zwróciła błąd HTTP ${response.status}.`);

    const fault = xmlValue(responseText, "Text") || xmlValue(responseText, "faultstring");
    if (fault && /Fault/i.test(responseText)) throw new Error(`GUS odrzucił zapytanie: ${fault}`);
    return responseText;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("GUS nie odpowiedział w wymaganym czasie.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function xmlRawValue(xml: string, tag: string): string {
  const safeTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(xml || "").match(new RegExp(`<(?:[\\w.-]+:)?${safeTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${safeTag}>`, "i"));
  if (!match) return "";
  return String(match[1] || "").replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/i, "$1").trim();
}

function xmlValue(xml: string, tag: string): string {
  return normalizeText(decodeXmlEntities(xmlRawValue(xml, tag))).replace(/<[^>]+>/g, "").trim();
}

function decodeXmlEntities(value: unknown): string {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isValidPolishNip(nip: string): boolean {
  if (!/^\d{10}$/.test(nip)) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const checksum = weights.reduce((sum, weight, index) => sum + weight * Number(nip[index]), 0) % 11;
  return checksum !== 10 && checksum === Number(nip[9]);
}

function digitsOnly(value: unknown): string {
  return normalizeText(value).replace(/\D+/g, "");
}

function normalizePostalCode(value: unknown): string {
  const digits = digitsOnly(value).slice(0, 5);
  return digits.length === 5 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : normalizeText(value);
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

function sanitizeProviderError(value: string): string {
  return normalizeText(value)
    .replace(/[A-Fa-f0-9]{20,}/g, "[ukryto]")
    .slice(0, 300);
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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
