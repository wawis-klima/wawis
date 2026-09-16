const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function assert(ok, message) { if (!ok) throw new Error(message); }

const push = read('src/mobile791/modules/push-subscriptions.js');
const hook = read('src/mobile791/hooks/usePushNotificationsState.js');
const layout = read('src/mobile791/components/jobs/MobileJobsLayout.jsx');
const diagnostics = read('src/mobile791/components/diagnostics/MobileDiagnosticButton.jsx');
const edge = read('supabase/functions/send-assignment-push/index.ts');
const migration = read('supabase/migrations/20260916095000_push_subscription_atomic_lifecycle_v1078.sql');
const styles = read('src/mobile791/styles.css');

assert(push.includes('eventType: "sync_subscription"'), 'Mobile push nadal zapisuje subskrypcję bezpośrednio zamiast przez backend');
assert(!push.includes('.from("push_subscriptions").upsert'), 'Mobile push zawiera bezpośredni UPSERT blokowany przez RLS');
assert(push.includes('eventType: "disable_subscription"'), 'Backend nadal musi rozumieć żądania wyłączenia');
assert(hook.includes('PUSH_HEALTHCHECK_MS'), 'Hook nie pilnuje obowiązkowego PUSH cyklicznie');
assert(!hook.includes('disablePushNotifications'), 'Hook nie może udostępniać możliwości wyłączenia PUSH');
assert(hook.includes('handleMandatoryPermissionGesture'), 'Brak jednorazowej aktywacji zgody PUSH z gestu użytkownika');

// 10.78: Edge nie robi już SELECT + bezwarunkowego UPSERT. Przekazuje komplet
// poświadczeń do serializowanego RPC, a PostgreSQL porównuje p256dh+auth pod lockiem.
assert(edge.includes('body.eventType === "sync_subscription"'), 'Edge Function nie rozpoznaje synchronizacji subskrypcji');
assert(edge.includes('push_subscription_sync_atomic'), 'Edge Function nie używa atomowego RPC synchronizacji endpointu');
assert(edge.includes('p_p256dh: p256dh'), 'Edge Function nie przekazuje p256dh do atomowego RPC');
assert(edge.includes('p_auth: auth'), 'Edge Function nie przekazuje auth do atomowego RPC');
assert(!edge.includes('.upsert(payload, { onConflict: "endpoint" })'), 'Edge Function wróciła do starego bezwarunkowego UPSERT endpointu');

assert(migration.includes('pg_advisory_xact_lock(hashtextextended(p_endpoint, 0))'), 'Atomowy lifecycle nie serializuje operacji tego samego endpointu');
assert(migration.includes('if v_row.p256dh <> p_p256dh or v_row.auth <> p_auth then'), 'PostgreSQL nie weryfikuje obu kluczy PUSH przed zmianą własności');
assert(migration.includes("raise exception 'push_credentials_mismatch'"), 'Brak twardego odrzucenia niezgodnych poświadczeń endpointu');
assert(migration.includes("raise exception 'push_owner_active'"), 'Aktywny właściciel endpointu nie jest chroniony');
assert(migration.includes("raise exception 'push_lifecycle_disabled'"), 'Tombstone starego lifecycle nie blokuje spóźnionego sync');

assert(layout.includes('wawisOneLineToolbar ${isAdmin ? "isAdmin" : "isWorker"}'), 'Nagłówek nie rozróżnia układu admin/pracownik');
assert(diagnostics.includes('Wyślij test push na ten telefon'), 'Brak testowego push w panelu mobilnym');
assert(diagnostics.includes('Pobierz raport diagnostyczny'), 'Brak raportu w panelu mobilnym');
assert(layout.includes('wawisOneLinePushSlot'), 'Brak PUSH w jednoliniowym nagłówku mobilnym');
assert(styles.includes('wawisOneLinePushSlot'), 'Brak stylu slotu PUSH w nagłówku mobilnym');

console.log('PASS smoke-push-mobile-reassignment-v918 — credentials verified atomically in PostgreSQL');
