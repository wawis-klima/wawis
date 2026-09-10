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
const styles = read('src/mobile791/styles.css');

assert(push.includes('eventType: "sync_subscription"'), 'Mobile push nadal zapisuje subskrypcję bezpośrednio zamiast przez backend');
assert(!push.includes('.from("push_subscriptions").upsert'), 'Mobile push zawiera bezpośredni UPSERT blokowany przez RLS');
assert(push.includes('eventType: "disable_subscription"'), 'Backend nadal musi rozumieć starsze żądania wyłączenia dla zgodności');
assert(hook.includes('PUSH_HEALTHCHECK_MS'), 'Hook nie pilnuje obowiązkowego PUSH cyklicznie');
assert(!hook.includes('disablePushNotifications'), 'Hook nie może udostępniać możliwości wyłączenia PUSH');
assert(hook.includes('handleMandatoryPermissionGesture'), 'Brak jednorazowej aktywacji zgody PUSH z gestu użytkownika');

assert(edge.includes('body.eventType === "sync_subscription"'), 'Edge Function nie rozpoznaje synchronizacji subskrypcji');
assert(edge.includes('String(existing?.p256dh || "") !== p256dh'), 'Edge Function nie weryfikuje klucza p256dh przy zmianie właściciela endpointu');
assert(edge.includes('String(existing?.auth || "") !== auth'), 'Edge Function nie weryfikuje klucza auth przy zmianie właściciela endpointu');
assert(edge.includes('.upsert(payload, { onConflict: "endpoint" })'), 'Edge Function nie przejmuje zweryfikowanego endpointu po zmianie konta');

assert(layout.includes('wawisOneLineToolbar ${isAdmin ? "isAdmin" : "isWorker"}'), 'Nagłówek nie rozróżnia układu admin/pracownik');
assert(diagnostics.includes('Wyślij test push na ten telefon'), 'Brak testowego push w panelu mobilnym');
assert(diagnostics.includes('Pobierz raport diagnostyczny'), 'Brak raportu w panelu mobilnym');
assert(layout.includes('wawisOneLinePushSlot'), 'Brak PUSH w jednoliniowym nagłówku mobilnym');

console.log('PASS smoke-push-mobile-reassignment-v918');
