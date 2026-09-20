const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
function assert(ok, message) { if (!ok) throw new Error(message); }

const desktopControl = read("src/components/PushNotificationsControl.jsx");
const mobileControl = read("src/mobile791/components/PushNotificationsControl.jsx");
const desktopHook = read("src/hooks/usePushNotificationsState.js");
const mobileHook = read("src/mobile791/hooks/usePushNotificationsState.js");
const desktopPush = read("src/modules/push-subscriptions.js");
const mobilePush = read("src/mobile791/modules/push-subscriptions.js");
const desktopApp = read("src/App.jsx");
const mobileApp = read("src/mobile791/App.jsx");

for (const [label, control] of [["desktop", desktopControl], ["mobile", mobileControl]]) {
  assert(control.includes("onToggle"), `${label}: kontrolka nie przyjmuje akcji przełączenia`);
  assert(control.includes('"ON" : "OFF"'), `${label}: brak rzeczywistych stanów ON/OFF`);
  assert(control.includes("aria-pressed={isOn}"), `${label}: brak dostępnego stanu przełącznika`);
  assert(!control.includes("isMandatory"), `${label}: pozostał wymuszony stan obowiązkowy`);
  assert(!control.includes("wawisPushMiniSwitchLocked"), `${label}: mobilny przełącznik nadal jest zablokowany`);
}

for (const [label, hook] of [["desktop", desktopHook], ["mobile", mobileHook]]) {
  assert(hook.includes("PUSH_ENABLED_STORAGE_PREFIX"), `${label}: brak trwałej preferencji PUSH`);
  assert(hook.includes("disablePushNotifications"), `${label}: hook nie wyłącza PUSH`);
  assert(hook.includes("togglePush"), `${label}: brak akcji togglePush`);
  assert(hook.includes("allowAutoRepair: userEnabled"), `${label}: samonaprawa nie respektuje OFF`);
  assert(hook.includes("waitForCurrentPushSync"), `${label}: ręczne OFF może przegrać wyścig z synchronizacją`);
  assert(hook.includes("persistPushEnabledPreference(userId, false)"), `${label}: OFF nie jest zapisywane przed domknięciem synchronizacji`);
  assert(!hook.includes("handleMandatoryPermissionGesture"), `${label}: pozostało wymuszanie zgody z pierwszego gestu`);
}

for (const [label, push] of [["desktop", desktopPush], ["mobile", mobilePush]]) {
  assert(push.includes("allowAutoRepair = true"), `${label}: brak sterowania samonaprawą`);
  assert(push.includes("push-user-disable-unsubscribe"), `${label}: wyłączenie nie usuwa lokalnej subskrypcji`);
  assert(push.includes("subscription.unsubscribe()"), `${label}: brak unsubscribe`);
  assert(!push.includes("PUSH jest obowiązkowy w aplikacji Wawis"), `${label}: została stara logika obowiązkowego PUSH`);
}

assert(mobilePush.includes("allowReassign = true"), "mobile: cleanup logout nie respektuje ręcznego OFF");
assert(mobilePush.includes("if (allowReassign && touchedCurrentSubscription"), "mobile: cleanup może reaktywować ręcznie wyłączony PUSH");

assert(desktopApp.includes("togglePush,"), "desktop App nie pobiera togglePush");
assert(desktopApp.includes("onToggle={togglePush}"), "desktop App nie przekazuje togglePush");
assert(mobileApp.includes("togglePush,"), "mobile App nie pobiera togglePush");
assert(mobileApp.includes("onToggle={togglePush}"), "mobile App nie przekazuje togglePush");

console.log("PASS smoke-push-toggle-v1097");
