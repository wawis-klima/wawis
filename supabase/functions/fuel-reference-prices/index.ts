// WAWIS 13.89 — urzędowe maksymalne ceny oleju napędowego (Monitor Polski, API Sejmu ELI) do zakładki
// „Oszczędności” w module paliwa. Tylko administrator. Zapis wyłącznie do public.fuel_reference_prices.
//
// POST (administrator, JWT) — dociąga brakujące obwieszczenia od początku liczenia zbiornika.
// POST z nagłówkiem x-wawis-dry: 1 — bez logowania i bez zapisu: odczyt i analiza ostatnich obwieszczeń
// (domyślnie 3, body {"limit": n} do 40; diagnostyka parsera; wyłącznie dane publiczne).
import { createClient } from "npm:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import {
  isFuelPriceAct,
  parseDieselPrice,
  pdfUrlForAct,
  resolveValidFrom,
  parseValidFromInText,
  parsePublishedOnFromText,
  normalizePdfText,
} from "./parse.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-wawis-dry",
};
const ELI_SEARCH = "https://api.sejm.gov.pl/eli/acts/search";
const MAX_PDFS_PER_RUN = 40;

type EliItem = {
  ELI?: string; publisher?: string; year?: number; pos?: number; title?: string;
  promulgation?: string; announcementDate?: string; textPDF?: boolean;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function fetchWithTimeout(url: string, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, headers: { "User-Agent": "WAWIS-fuel-savings/1.0" } });
  } finally {
    clearTimeout(timer);
  }
}

async function listActs(year: number): Promise<EliItem[]> {
  const url = `${ELI_SEARCH}?publisher=MP&year=${year}&title=${encodeURIComponent("maksymalnej ceny paliw")}&limit=500`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`ELI search ${year}: HTTP ${response.status}`);
  const body = await response.json();
  const items: EliItem[] = Array.isArray(body?.items) ? body.items : [];
  return items.filter((item) => isFuelPriceAct(item));
}

async function readPdfText(url: string): Promise<string> {
  const response = await fetchWithTimeout(url, 20000);
  if (!response.ok) throw new Error(`PDF HTTP ${response.status}`);
  const buffer = new Uint8Array(await response.arrayBuffer());
  const pdf = await getDocumentProxy(buffer);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : String(text || "");
}

async function analyseAct(item: EliItem) {
  const url = pdfUrlForAct(item);
  const text = await readPdfText(url);
  const price = parseDieselPrice(text);
  const promulgation = parsePublishedOnFromText(text) || String(item.promulgation || item.announcementDate || "");
  return {
    eli: String(item.ELI || ""),
    pos: Number(item.pos || 0),
    promulgation,
    validFromText: parseValidFromInText(text),
    validFrom: resolveValidFrom({ text, promulgation }),
    price,
    url,
    excerpt: normalizePdfText(text).slice(0, 900),
  };
}

function warsawYear(date = new Date()) {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric" }).format(date));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Metoda niedozwolona." }, 405);

  try {
    if (request.headers.get("x-wawis-dry") === "1") {
      const body = await request.json().catch(() => ({}));
      if (body?.action === "probe-wob") {
        // Diagnostyka: odczyt pliku „Weekly Oil Bulletin — prices with taxes” (dane publiczne KE), bez zapisu.
        const page = await (await fetchWithTimeout("https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en")).text();
        const link = (page.match(/href="([^"]*prices%20with%20[Tt]axes[^"]*\.xlsx[^"]*)"/) || [])[1] || "";
        const url = link.startsWith("http") ? link : `https://energy.ec.europa.eu${link}`;
        const XLSX = await import("npm:xlsx@0.18.5");
        const buffer = new Uint8Array(await (await fetchWithTimeout(url, 30000)).arrayBuffer());
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheets = workbook.SheetNames.map((name: string) => {
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, blankrows: false }) as unknown[][];
          const head = rows.slice(0, 8);
          const poland = rows.filter((row) => row.some((cell) => /pol(and|ogne)|^PL$/i.test(String(cell ?? "").trim())));
          return { name, head, poland };
        });
        return json({ ok: true, url, sheets });
      }
      const limit = Math.min(Math.max(Number(body?.limit) || 3, 1), MAX_PDFS_PER_RUN);
      const acts = (await listActs(warsawYear()))
        .filter((item) => item.textPDF)
        .sort((a, b) => Number(b.pos || 0) - Number(a.pos || 0))
        .slice(0, limit);
      const analysed = [];
      for (const act of acts) {
        try { analysed.push(await analyseAct(act)); } catch (error) { analysed.push({ eli: act.ELI, error: String((error as Error)?.message || error) }); }
      }
      return json({ ok: true, dry: true, analysed });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Brakuje konfiguracji Supabase." }, 500);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: request.headers.get("Authorization") || "" } } });
    const { data: isAdmin, error: adminError } = await userClient.rpc("current_user_is_admin");
    if (adminError || isAdmin !== true) return json({ error: "Tylko administrator może pobierać ceny paliw." }, 403);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: opening } = await admin.from("fuel_tank_movements")
      .select("happened_at").in("movement_type", ["opening", "delivery"])
      .order("happened_at", { ascending: true }).limit(1).maybeSingle();
    if (!opening?.happened_at) return json({ ok: true, added: 0, reason: "Brak dostaw do zbiornika." });

    // Obwieszczenie z dnia poprzedzającego start obowiązuje już w dniu startu — bierzemy 5 dni zapasu.
    const sinceIso = new Date(new Date(opening.happened_at).getTime() - 5 * 86400000).toISOString().slice(0, 10);
    const startYear = Number(sinceIso.slice(0, 4));
    const endYear = warsawYear();

    const { data: stored, error: storedError } = await admin.from("fuel_reference_prices").select("eli");
    if (storedError) throw storedError;
    const storedEli = new Set((stored || []).map((row: { eli: string }) => row.eli));

    const candidates: EliItem[] = [];
    for (let year = startYear; year <= endYear; year += 1) {
      for (const item of await listActs(year)) {
        const promulgation = String(item.promulgation || item.announcementDate || "");
        if (promulgation >= sinceIso && item.textPDF && !storedEli.has(String(item.ELI || ""))) candidates.push(item);
      }
    }
    candidates.sort((a, b) => Number(a.year || 0) - Number(b.year || 0) || Number(a.pos || 0) - Number(b.pos || 0));

    const rows = [];
    const failures: string[] = [];
    for (const item of candidates.slice(0, MAX_PDFS_PER_RUN)) {
      try {
        const result = await analyseAct(item);
        if (!result.price || !result.validFrom) {
          failures.push(`${result.eli}: nie odczytano ceny lub daty`);
          continue;
        }
        rows.push({
          eli: result.eli,
          act_year: Number(item.year || 0),
          act_pos: result.pos,
          promulgated_on: result.promulgation,
          valid_from: result.validFrom,
          diesel_net: result.price.net,
          diesel_gross: result.price.gross,
          vat_rate: result.price.vatRate,
          source_url: result.url,
          title: String(item.title || "").slice(0, 300),
        });
      } catch (error) {
        failures.push(`${item.ELI}: ${String((error as Error)?.message || error).slice(0, 160)}`);
      }
    }

    if (rows.length) {
      const { error: upsertError } = await admin.from("fuel_reference_prices").upsert(rows, { onConflict: "eli" });
      if (upsertError) throw upsertError;
    }
    if (failures.length) console.warn("fuel-reference-prices failures", failures);

    return json({
      ok: true,
      added: rows.length,
      pending: Math.max(0, candidates.length - MAX_PDFS_PER_RUN),
      failures,
    });
  } catch (error) {
    console.error("fuel-reference-prices error", error);
    return json({ error: "Nie udało się pobrać cen paliw z Monitora Polskiego." }, 502);
  }
});
