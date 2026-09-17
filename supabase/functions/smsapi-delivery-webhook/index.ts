import { createClient } from "npm:@supabase/supabase-js@2";
import {
  constantTimeEqual,
  deriveSmsApiCallbackToken,
  normalizeSmsApiStatus,
  planSmsCallbackUpdates,
} from './security.mjs';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CallbackEntry = {
  providerMessageId: string;
  status: string;
  statusName: string;
  raw: Record<string, unknown>;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const smsApiToken = Deno.env.get('SMSAPI_ACCESS_TOKEN') || '';
    if (!supabaseUrl || !serviceRoleKey || !smsApiToken) {
      return json({ error: 'Brakuje konfiguracji Supabase/SMSAPI.' }, 500);
    }

    const callbackUrl = new URL(request.url);
    const providedToken = callbackUrl.searchParams.get('auth') || '';
    const expectedToken = await deriveSmsApiCallbackToken(smsApiToken);
    if (!constantTimeEqual(providedToken, expectedToken)) {
      return json({ ok: false, error: 'Nieautoryzowany callback SMSAPI.' }, 401);
    }

    const entries = await parseCallbackEntries(request, callbackUrl);
    if (!entries.length) {
      return json({ ok: false, error: 'Brak provider_message_id w callbacku.' }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    for (const entry of entries) {
      const result = await applyDeliveryStatus(adminClient, entry);
      if (!result.ok) return json(result, result.status || 500);
    }

    return new Response('OK', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function parseCallbackEntries(request: Request, callbackUrl: URL): Promise<CallbackEntry[]> {
  let raw: Record<string, unknown> = Object.fromEntries(callbackUrl.searchParams.entries());

  if (request.method !== 'GET') {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      raw = { ...raw, ...((await request.json()) as Record<string, unknown>) };
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      raw = { ...raw, ...Object.fromEntries(form.entries()) };
    }
  }

  const ids = splitValues(firstValue(raw, ['MsgId', 'msgid', 'id', 'message_id', 'sms_id']));
  const statuses = splitValues(firstValue(raw, ['status', 'delivery_status', 'type']));
  const statusNames = splitValues(firstValue(raw, ['status_name', 'statusName']));

  return ids.filter(Boolean).map((providerMessageId, index) => ({
    providerMessageId,
    status: statuses[index] || statuses[0] || '',
    statusName: statusNames[index] || statusNames[0] || '',
    raw,
  }));
}

async function applyDeliveryStatus(adminClient: ReturnType<typeof createClient>, entry: CallbackEntry) {
  const nextStatus = normalizeSmsApiStatus(entry.status, entry.statusName);
  const { data, error } = await adminClient.rpc('apply_sms_delivery_atomic', {
    p_provider_message_id: entry.providerMessageId,
    p_status: nextStatus,
    p_error: nextStatus === 'error' ? JSON.stringify(entry.raw) : null,
  });
  if (error) return { ok: false, status: 500, error: error.message };
  return data || { ok: false, status: 500, error: 'Missing atomic callback result' };
}

function firstValue(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim()) return String(value);
  }
  return '';
}

function splitValues(value: string) {
  return String(value || '').split(',').map((item) => item.trim());
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
