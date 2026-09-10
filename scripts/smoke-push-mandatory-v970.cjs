const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
function assert(ok, message) { if (!ok) throw new Error(message); }

const desktopControl = read('src/components/PushNotificationsControl.jsx');
const mobileControl = read('src/mobile791/components/PushNotificationsControl.jsx');
const desktopHook = read('src/hooks/usePushNotificationsState.js');
const mobileHook = read('src/mobile791/hooks/usePushNotificationsState.js');
const desktopPush = read('src/modules/push-subscriptions.js');
const mobilePush = read('src/mobile791/modules/push-subscriptions.js');
const desktopApp = read('src/App.jsx');
const mobileApp = read('src/mobile791/App.jsx');
const mobileStyles = read('src/mobile791/styles.css');

for (const [label, control] of [['desktop', desktopControl], ['mobile', mobileControl]]) {
  assert(!control.includes('disablePush'), `${label}: kontrolka nadal przyjmuje disablePush`);
  assert(!control.includes('Wyłącz'), `${label}: kontrolka nadal pokazuje opcję Wyłącz`);
  assert(control.includes('pushControlMandatory'), `${label}: brak stałego zielonego stanu PUSH`);
  assert(control.includes('PUSH włączony na stałe'), `${label}: brak komunikatu stałego PUSH`);
}

for (const [label, hook] of [['desktop', desktopHook], ['mobile', mobileHook]]) {
  assert(!hook.includes('disablePushNotifications'), `${label}: hook nadal wyłącza PUSH`);
  assert(hook.includes('PUSH_HEALTHCHECK_MS = 5 * 60 * 1000'), `${label}: brak healthcheck co 5 minut`);
  assert(hook.includes('handleMandatoryPermissionGesture'), `${label}: brak zgody z pierwszego gestu użytkownika`);
  assert(hook.includes('window.addEventListener("online", handleOnline)'), `${label}: brak naprawy po odzyskaniu internetu`);
}

for (const [label, push] of [['desktop', desktopPush], ['mobile', mobilePush]]) {
  assert(push.includes('export async function ensurePushNotifications'), `${label}: brak ensurePushNotifications`);
  assert(push.includes('if (!subscription && permission === "granted"'), `${label}: brak automatycznej odbudowy lokalnej subskrypcji`);
  assert(push.includes('replaceExpiredPushSubscription'), `${label}: brak wymiany endpointu wygasłego po 404/410`);
  assert(push.includes('existingServerRow.is_active === false'), `${label}: brak wykrywania endpointu wyłączonego przez serwer`);
  assert(push.includes('return ensurePushNotifications({ supabase, sessionUser, requestPermission: false })'), `${label}: starsze wywołanie disable nie jest zabezpieczone przed wyłączeniem`);
}

assert(!desktopApp.includes('disablePush={'), 'desktop App nadal przekazuje wyłączanie PUSH');
assert(!mobileApp.includes('disablePush={'), 'mobile App nadal przekazuje wyłączanie PUSH');
assert(mobileStyles.includes('.wawisPushMini.isMandatory'), 'mobile: brak zielonego wymuszonego stylu PUSH');

console.log('PASS smoke-push-mandatory-v970');
