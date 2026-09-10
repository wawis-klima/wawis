import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-backup-secret",
};

type BackupRow = {
  id: number;
  source_bucket: string;
  source_path: string;
  source_kind: "photo" | "protocol";
  source_version: number;
  attempt_count: number;
};

function requiredEnv(name: string) {
  const value = String(Deno.env.get(name) || "").trim();
  if (!value) throw new Error(`Brak sekretu ${name}.`);
  return value;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Nieznany błąd");
  return message.replace(/https?:\/\/\S+/gi, "[URL]").slice(0, 500);
}

async function callerIsAllowed(req: Request, sourceAdmin: ReturnType<typeof createClient>) {
  const configuredSecret = String(Deno.env.get("BACKUP_CRON_SECRET") || "").trim();
  const requestSecret = String(req.headers.get("x-backup-secret") || "").trim();
  if (configuredSecret && requestSecret && requestSecret === configuredSecret) return true;

  const authorization = String(req.headers.get("authorization") || "");
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const { data: userData, error: userError } = await sourceAdmin.auth.getUser(token);
  if (userError || !userData.user) return false;
  const { data: profile } = await sourceAdmin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  return String(profile?.role || "").toLowerCase() === "administrator";
}

async function ensurePrivateBucket(client: ReturnType<typeof createClient>, bucket: string) {
  const { data } = await client.storage.getBucket(bucket);
  if (data) {
    if (data.public) await client.storage.updateBucket(bucket, { public: false });
    return;
  }
  const { error } = await client.storage.createBucket(bucket, { public: false });
  if (error && !/already exists|duplicate/i.test(error.message || "")) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const sourceUrl = requiredEnv("SUPABASE_URL");
    const sourceServiceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const backupUrl = requiredEnv("BACKUP_SUPABASE_URL");
    const backupServiceKey = requiredEnv("BACKUP_SUPABASE_SERVICE_ROLE_KEY");
    const photoBucket = String(Deno.env.get("BACKUP_PHOTO_BUCKET") || "wawis-job-photos-backup").trim();
    const protocolBucket = String(Deno.env.get("BACKUP_PROTOCOL_BUCKET") || "wawis-job-protocols-backup").trim();
    const sourceAdmin = createClient(sourceUrl, sourceServiceKey, { auth: { persistSession: false } });
    const backupAdmin = createClient(backupUrl, backupServiceKey, { auth: { persistSession: false } });

    if (!(await callerIsAllowed(req, sourceAdmin))) return json({ error: "forbidden" }, 403);

    const requestBody = await req.json().catch(() => ({}));
    const batchSize = Math.min(Math.max(Number(requestBody?.limit || 20), 1), 50);
    await Promise.all([
      ensurePrivateBucket(backupAdmin, photoBucket),
      ensurePrivateBucket(backupAdmin, protocolBucket),
    ]);

    // Wpis pozostawiony w stanie copying przez przerwana funkcje wraca do kolejki.
    await sourceAdmin
      .from("storage_backup_queue")
      .update({ status: "pending", next_attempt_at: new Date().toISOString() })
      .eq("status", "copying")
      .lt("last_attempt_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

    const { data, error } = await sourceAdmin
      .from("storage_backup_queue")
      .select("id, source_bucket, source_path, source_kind, source_version, attempt_count")
      .in("status", ["pending", "error"])
      .lte("next_attempt_at", new Date().toISOString())
      .order("id", { ascending: true })
      .limit(batchSize);
    if (error) throw error;

    const rows = (data || []) as BackupRow[];
    let copied = 0;
    let failed = 0;

    for (const row of rows) {
      const attempt = Number(row.attempt_count || 0) + 1;
      const startedAt = new Date().toISOString();
      await sourceAdmin.from("storage_backup_queue").update({
        status: "copying",
        attempt_count: attempt,
        last_attempt_at: startedAt,
        last_error: "",
        updated_at: startedAt,
      }).eq("id", row.id).eq("source_version", row.source_version);

      try {
        const { data: sourceFile, error: downloadError } = await sourceAdmin.storage
          .from(row.source_bucket)
          .download(row.source_path);
        if (downloadError || !sourceFile) throw downloadError || new Error("Nie znaleziono pliku zrodlowego.");

        const targetBucket = row.source_kind === "protocol" ? protocolBucket : photoBucket;
        const destinationPath = row.source_path;
        const contentType = sourceFile.type || (row.source_kind === "protocol" ? "application/pdf" : "image/jpeg");
        const { error: uploadError } = await backupAdmin.storage
          .from(targetBucket)
          .upload(destinationPath, sourceFile, { upsert: true, contentType, cacheControl: "3600" });
        if (uploadError) throw uploadError;

        const completedAt = new Date().toISOString();
        const { error: stateError } = await sourceAdmin.from("storage_backup_queue").update({
          status: "completed",
          completed_at: completedAt,
          destination_path: `${targetBucket}/${destinationPath}`,
          last_error: "",
          updated_at: completedAt,
        }).eq("id", row.id).eq("source_version", row.source_version);
        if (stateError) throw stateError;
        copied += 1;
      } catch (copyError) {
        failed += 1;
        const backoffMinutes = Math.min(6 * 60, Math.max(1, 2 ** Math.min(attempt - 1, 8)));
        const nextAttemptAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
        await sourceAdmin.from("storage_backup_queue").update({
          status: "error",
          next_attempt_at: nextAttemptAt,
          last_error: cleanError(copyError),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id).eq("source_version", row.source_version);
      }
    }

    return json({ ok: true, processed: rows.length, copied, failed, hasMore: rows.length === batchSize });
  } catch (error) {
    return json({ ok: false, error: cleanError(error) }, 500);
  }
});
