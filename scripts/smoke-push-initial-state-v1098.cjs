const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
function assert(ok, message) { if (!ok) throw new Error(message); }

const pairs = [
  ["desktop", "src/hooks/usePushNotificationsState.js", "src/components/PushNotificationsControl.jsx", "src/utils/pushState.js"],
  ["mobile", "src/mobile791/hooks/usePushNotificationsState.js", "src/mobile791/components/PushNotificationsControl.jsx", "src/mobile791/utils/pushState.js"],
];

for (const [label, hookPath, controlPath, statePath] of pairs) {
  const hook = read(hookPath);
  const control = read(controlPath);
  const state = read(statePath);

  assert(hook.includes('PUSH_STATE_STORAGE_PREFIX = "wawis:push-state:v3"'), `${label}: brak trwałego cache stanu PUSH v3`);
  assert(hook.includes("window.localStorage.getItem(getPushStateStorageKey(userId))"), `${label}: start nie czyta ostatniego potwierdzonego stanu z localStorage`);
  assert(hook.includes("window.localStorage.setItem(getPushStateStorageKey(userId), serialized)"), `${label}: potwierdzony stan nie jest zapisywany między uruchomieniami`);
  assert(hook.includes("LEGACY_PUSH_STATE_SESSION_STORAGE_PREFIX"), `${label}: brak migracji cache v10.97 z bieżącej sesji`);
  assert(hook.includes("statusKnown: userEnabled === false"), `${label}: pierwszy start z ręcznym OFF nie zachowuje pewnego OFF`);
  assert(hook.includes("statusKnown: true"), `${label}: synchronizacja nie oznacza stanu jako zweryfikowany`);

  assert(state.includes("statusKnown: false"), `${label}: stan początkowy błędnie udaje zweryfikowany`);
  assert(control.includes('"PUSH · sprawdzanie"'), `${label}: brak neutralnego stanu podczas pierwszej weryfikacji`);
  assert(control.includes("isChecking"), `${label}: kontrolka nie rozróżnia sprawdzania od OFF`);
  assert(control.includes('busy || isChecking ? "…"'), `${label}: kontrolka pokazuje OFF zanim zna stan`);
  assert(control.includes('disabled={busy || isChecking || typeof onToggle !== "function"}'), `${label}: przełącznik jest aktywny zanim zakończy weryfikację`);
}

console.log("PASS smoke-push-initial-state-v1098");
