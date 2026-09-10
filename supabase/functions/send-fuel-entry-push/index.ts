import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type FuelPushRequest = {
  fuelEntryId?: string;
  triggeredBy?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const vapidPublicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY") || "";
    const vapidPrivateKey = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") || "";
    const vapidSubject = Deno.env.get("WEB_PUSH_VAPID_SUBJECT") || "mailto:admin@example.com";

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
      return json({ error: "Brakuje konfiguracji środowiskowej Edge Function dla web push." }, 500);
    }

    const authHeader = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return json({ error: "Brak autoryzacji użytkownika." }, 401);
    }

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", authData.user.id)
      .single();

    if (callerProfileError || !callerProfile) {
      return json({ error: "Nie udało się pobrać profilu użytkownika." }, 403);
    }

    if (callerProfile.role === "Administrator") {
      return json({ ok: true, delivered: 0, skipped: 1, reason: "Tankowanie administratora nie wymaga powiadomienia push." });
    }

    const body = (await request.json()) as FuelPushRequest;
    const fuelEntryId = String(body.fuelEntryId || "").trim();
    if (!fuelEntryId) {
      return json({ error: "Brak fuelEntryId." }, 400);
    }

    const { data: entry, error: entryError } = await adminClient
      .from("fuel_entries")
      .select("id, vehicle_id, liters, odometer_km, fueled_at, created_by")
      .eq("id", fuelEntryId)
      .maybeSingle();

    if (entryError) return json({ error: entryError.message }, 500);
    if (!entry) return json({ error: "Nie znaleziono tankowania." }, 404);
    if (String(entry.created_by || "") !== String(authData.user.id)) {
      return json({ error: "To tankowanie nie zostało zapisane przez zalogowanego użytkownika." }, 403);
    }

    const { data: vehicle, error: vehicleError } = await adminClient
      .from("fuel_vehicles")
      .select("id, vehicle_name, registration_number")
      .eq("id", entry.vehicle_id)
      .maybeSingle();

    if (vehicleError) return json({ error: vehicleError.message }, 500);
    if (!vehicle) return json({ error: "Nie znaleziono samochodu dla tankowania." }, 404);

    const { data: adminProfiles, error: adminProfilesError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("role", "Administrator");

    if (adminProfilesError) return json({ error: adminProfilesError.message }, 500);

    const adminUserIds = [...new Set((adminProfiles || [])
      .map((profile: any) => String(profile.id || ""))
      .filter((userId: string) => Boolean(userId) && userId !== String(authData.user.id)))];

    if (!adminUserIds.length) {
      return json({ ok: true, delivered: 0, skipped: 0, reason: "Brak profilu administratora." });
    }

    const deliveryLogType = `fuel_entry:${entry.id}`;
    const { data: sentLogs, error: sentLogsError } = await adminClient
      .from("push_delivery_log")
      .select("user_id")
      .is("job_id", null)
      .eq("type", deliveryLogType)
      .eq("status", "sent");

    if (sentLogsError) return json({ error: sentLogsError.message }, 500);

    const alreadySent = new Set((sentLogs || []).map((row: any) => String(row.user_id || "")).filter(Boolean));
    const targetAdminIds = adminUserIds.filter((userId) => !alreadySent.has(userId));
    if (!targetAdminIds.length) {
      return json({ ok: true, delivered: 0, skipped: adminUserIds.length, alreadyDelivered: true });
    }

    const vehicleName = String(vehicle.vehicle_name || "").trim();
    const registration = String(vehicle.registration_number || "").trim();
    const vehicleLabel = vehicleName && registration
      ? `${vehicleName} — ${registration}`
      : (vehicleName || registration || "Samochód");
    const liters = Number(entry.liters);
    const litersLabel = Number.isFinite(liters)
      ? `${liters.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} l`
      : "— l";
    const odometer = Number(entry.odometer_km);
    const odometerLabel = Number.isInteger(odometer)
      ? `${odometer.toLocaleString("pl-PL")} km`
      : "— km";
    const employee = String(callerProfile.full_name || "Pracownik").trim() || "Pracownik";

    const { data: subscriptions, error: subscriptionsError } = await adminClient
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", targetAdminIds)
      .eq("is_active", true);

    if (subscriptionsError) return json({ error: subscriptionsError.message }, 500);

    const subscribedUsers = new Set((subscriptions || []).map((row: any) => String(row.user_id || "")));
    const usersWithoutSubscription = targetAdminIds.filter((userId) => !subscribedUsers.has(String(userId)));

    if (usersWithoutSubscription.length) {
      await insertDeliveryRows(adminClient, usersWithoutSubscription.map((userId) => ({
        user_id: userId,
        job_id: null,
        type: deliveryLogType,
        status: "skipped",
        response_code: null,
        error_message: "Brak aktywnej subskrypcji push.",
      })));
    }

    if (!subscriptions?.length) {
      return json({ ok: true, delivered: 0, skipped: targetAdminIds.length, reason: "Brak aktywnych subskrypcji." });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const payload = JSON.stringify({
      type: "fuel_entry_created",
      jobId: null,
      title: "Zatankowano samochód",
      body: `${employee} • ${vehicleLabel} • ${litersLabel} • licznik ${odometerLabel}`,
      url: "/",
      tag: `fuel-entry-${entry.id}`,
    });

    const results = await Promise.all(subscriptions.map(async (subscription: any) => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        }, payload);

        await insertDeliveryRows(adminClient, [{
          user_id: subscription.user_id,
          job_id: null,
          type: deliveryLogType,
          status: "sent",
          response_code: 201,
          error_message: null,
        }]);

        return { ok: true, subscriptionId: subscription.id };
      } catch (error) {
        const statusCode = typeof error?.statusCode === "number" ? error.statusCode : null;
        const errorMessage = error instanceof Error ? error.message : String(error);

        await insertDeliveryRows(adminClient, [{
          user_id: subscription.user_id,
          job_id: null,
          type: deliveryLogType,
          status: statusCode === 404 || statusCode === 410 ? "expired" : "error",
          response_code: statusCode,
          error_message: errorMessage,
        }]);

        if (statusCode === 404 || statusCode === 410) {
          await adminClient.from("push_subscriptions").update({ is_active: false }).eq("id", subscription.id);
        }

        return { ok: false, subscriptionId: subscription.id, statusCode, errorMessage };
      }
    }));

    return json({
      ok: true,
      delivered: results.filter((item: any) => item.ok).length,
      failed: results.filter((item: any) => !item.ok).length,
      skipped: usersWithoutSubscription.length,
      results,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function insertDeliveryRows(adminClient: any, rows: any[]) {
  if (!rows.length) return;
  const { error } = await adminClient.from("push_delivery_log").insert(rows);
  if (error) console.warn("Nie udało się zapisać push_delivery_log:", error.message);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
