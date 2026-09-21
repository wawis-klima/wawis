const path = require("path");
const { pathToFileURL } = require("url");

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

(async () => {
  const moduleUrl = pathToFileURL(
    path.resolve(__dirname, "../src/mobile791/utils/pushState.js"),
  ).href;
  const { isPushDisplayOn } = await import(moduleUrl);

  const granted = {
    supported: true,
    vapidConfigured: true,
    permission: "granted",
    userEnabled: true,
    statusKnown: true,
  };

  assert(isPushDisplayOn({ ...granted, ready: true }), "potwierdzony PUSH powinien pokazywać ON");
  assert(
    isPushDisplayOn({ ...granted, ready: false, syncError: "chwilowy błąd synchronizacji" }),
    "chwilowa awaria synchronizacji nie może udawać ręcznego OFF",
  );
  assert(
    !isPushDisplayOn({ ...granted, ready: true, userEnabled: false }),
    "ręczne OFF musi mieć pierwszeństwo",
  );
  assert(
    !isPushDisplayOn({ ...granted, ready: false, permission: "denied" }),
    "blokada systemowa nie może pokazywać ON",
  );
  assert(
    !isPushDisplayOn({ ...granted, ready: false, statusKnown: false }),
    "nieznany stan powinien pozostać neutralny",
  );

  const hook = require("fs").readFileSync(
    path.resolve(__dirname, "../src/mobile791/hooks/usePushNotificationsState.js"),
    "utf8",
  );
  const control = require("fs").readFileSync(
    path.resolve(__dirname, "../src/mobile791/components/PushNotificationsControl.jsx"),
    "utf8",
  );
  assert(hook.includes("const isOn = isPushDisplayOn(pushState)"), "toggle nie korzysta ze stanu wizualnego");
  assert(control.includes("isPushDisplayOn(pushState)"), "kontrolka nie korzysta ze stanu preferencji");

  console.log("PASS smoke-push-display-v1105");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
