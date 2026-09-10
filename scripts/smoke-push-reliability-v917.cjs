const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function assert(ok, message) { if (!ok) throw new Error(message); }

const desktopPush = read('src/modules/push-subscriptions.js');
const mobilePush = read('src/mobile791/modules/push-subscriptions.js');
const desktopHook = read('src/hooks/usePushNotificationsState.js');
const mobileHook = read('src/mobile791/hooks/usePushNotificationsState.js');
const edge = read('supabase/functions/send-assignment-push/index.ts');
const desktopJobsAssignment = read('src/modules/jobs-assignment.js');
const mobileJobsAssignment = read('src/mobile791/modules/jobs-assignment.js');
const diagnostics = read('src/components/diagnostics/DiagnosticsPanel.jsx');
const mobileDiagnostics = read('src/mobile791/components/diagnostics/MobileDiagnosticButton.jsx');

for (const [name, source] of [['desktop push', desktopPush], ['mobile push', mobilePush]]) {
  assert(source.includes('serverActive'), `${name}: brak kontroli aktywnej subskrypcji po stronie serwera`);
  assert(source.includes('last_seen_at'), `${name}: brak odświeżania last_seen_at`);
  assert(source.includes('savePushSubscription({ supabase, sessionUser, subscription, force: true })'), `${name}: brak automatycznej synchronizacji subskrypcji`);
  assert(source.includes('ensurePushNotifications'), `${name}: brak samonaprawy obowiązkowego PUSH`);
  assert(source.includes('if (!subscription && permission === "granted"'), `${name}: brak automatycznego odtworzenia utraconej subskrypcji`);
  assert(source.includes('ready: Boolean(subscription) && permission === "granted" && serverActive'), `${name}: status Push aktywne nadal nie zależy od Supabase`);
  assert(source.includes('eventType: "push_test"'), `${name}: brak wywołania testowego push`);
}

for (const [name, source] of [['desktop hook', desktopHook], ['mobile hook', mobileHook]]) {
  assert(source.includes('visibilitychange'), `${name}: brak synchronizacji po powrocie do aplikacji`);
  assert(source.includes('pageshow'), `${name}: brak synchronizacji przy ponownym pokazaniu PWA`);
  assert(source.includes('PUSH_HEALTHCHECK_MS'), `${name}: brak cyklicznej kontroli obowiązkowego PUSH`);
  assert(!source.includes('disablePushNotifications'), `${name}: hook nadal umożliwia wyłączenie PUSH`);
}

assert(edge.includes('eventType?: "job_assigned" | "job_completed" | "job_comment" | "push_test"'), 'Edge: kontrakt musi zachować job_comment i push_test');
assert(edge.includes('Tylko administrator może uruchomić test push.'), 'Edge: test push nie jest ograniczony do administratora');
assert(edge.includes('.eq("endpoint", subscriptionEndpoint)'), 'Edge: test bieżącego urządzenia nie filtruje endpointu');
assert(edge.includes('loadCompletedJobWithRetry'), 'Edge: brak kontrolowanego ponowienia odczytu statusu Zakończone');
assert(edge.includes('retryDelaysMs = [0, 250, 700, 1400]'), 'Edge: brak oczekiwanej strategii retry');
assert(edge.includes('deliveryType: "push_test"'), 'Edge: brak logowania typu push_test');

for (const [name, source] of [['desktop completion', desktopJobsAssignment], ['mobile completion', mobileJobsAssignment]]) {
  assert(source.includes('const retryDelaysMs = [0, 700, 1400]'), `${name}: brak retry klienta dla 409`);
  assert(source.includes("response.status !== 409"), `${name}: retry nie jest ograniczony do 409`);
}

assert(diagnostics.includes('Wyślij testowe powiadomienie push'), 'Desktop Diagnostyka: brak przycisku testowego push');
assert(mobileDiagnostics.includes('Wyślij test push na ten telefon'), 'Mobile Diagnostyka: brak testu konkretnego telefonu');
assert(mobileDiagnostics.includes('targetCurrentDevice: true'), 'Mobile Diagnostyka: test nie jest przypięty do bieżącego endpointu');

console.log('PASS smoke-push-reliability-v917');
