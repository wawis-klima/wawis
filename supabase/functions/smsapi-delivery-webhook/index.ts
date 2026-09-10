import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Brakuje konfiguracji Supabase.' }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const contentType = request.headers.get('content-type') || '';

    let providerMessageId = '';
    let status = '';
    let raw: Record<string, unknown> = {};

    if (contentType.includes('application/json')) {
      raw = await request.json();
      providerMessageId = String(raw.id || raw.message_id || raw.sms_id || '');
      status = String(raw.status || raw.delivery_status || raw.type || '').toLowerCase();
    } else {
      const form = await request.formData();
      raw = Object.fromEntries(form.entries());
      providerMessageId = String(form.get('id') || form.get('message_id') || form.get('sms_id') || '');
      status = String(form.get('status') || form.get('delivery_status') || form.get('type') || '').toLowerCase();
    }

    if (!providerMessageId) {
      return json({ ok: false, error: 'Brak provider_message_id w callbacku.' }, 400);
    }

    const deliveredStatuses = new Set(['delivered', 'doręczona', 'dostarczona']);
    const failedStatuses = new Set(['error', 'failed', 'undelivered']);
    const nextStatus = deliveredStatuses.has(status) ? 'delivered' : failedStatuses.has(status) ? 'error' : 'provider_sent';
    const nowIso = new Date().toISOString();

    const { data: logRow, error: fetchError } = await adminClient
      .from('sms_log')
      .select('id, job_id, status')
      .eq('provider_message_id', providerMessageId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError || !logRow) {
      return json({ ok: false, error: 'Nie znaleziono wpisu sms_log dla provider_message_id.' }, 404);
    }

    const patch: Record<string, unknown> = {
      status: nextStatus,
      error_message: nextStatus === 'error' ? JSON.stringify(raw) : null,
    };
    if (nextStatus === 'delivered') patch.delivered_at = nowIso;

    await adminClient.from('sms_log').update(patch).eq('id', logRow.id);

    if (logRow.job_id) {
      const jobPatch: Record<string, unknown> = {
        last_sms_status: nextStatus,
        last_sms_error: nextStatus === 'error' ? JSON.stringify(raw) : null,
      };
      if (nextStatus === 'delivered') jobPatch.last_sms_sent_at = nowIso;
      await adminClient.from('jobs').update(jobPatch).eq('id', logRow.job_id);
    }

    return json({ ok: true, providerMessageId, nextStatus });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
