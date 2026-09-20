const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
function assert(ok, message) { if (!ok) throw new Error(message); }

const desktopApp = read("src/App.jsx");
const mobileApp = read("src/mobile791/App.jsx");

assert(!desktopApp.includes("usePushNotificationsState"), "desktop: nie wolno inicjalizować hooka PUSH");
assert(!desktopApp.includes("PushNotificationsControl"), "desktop: kontrolka PUSH musi być usunięta");
assert(desktopApp.includes("pushControl={null}"), "desktop: layout musi dostać brak kontrolki PUSH");

assert(mobileApp.includes("usePushNotificationsState"), "mobile: hook PUSH musi pozostać aktywny");
assert(mobileApp.includes("<PushNotificationsControl"), "mobile: kontrolka PUSH musi pozostać aktywna");
assert(mobileApp.includes("onToggle={togglePush}"), "mobile: użytkownik musi nadal móc przełączać PUSH");

console.log("PASS smoke-desktop-push-disabled-v1099");
