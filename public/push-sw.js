self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open("wawis-app-shell-v10.32");
    await Promise.allSettled([
      cache.add("/"),
      cache.add("/manifest.webmanifest"),
      cache.add("/logo.png"),
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith("wawis-app-shell-") && key !== "wawis-app-shell-v10.32")
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.headers.has("range")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open("wawis-app-shell-v10.32");
          await cache.put("/", response.clone());
        }
        return response;
      } catch {
        return (await caches.match("/")) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && ["script", "style", "image", "font", "worker"].includes(request.destination)) {
      const cache = await caches.open("wawis-app-shell-v10.32");
      await cache.put(request, response.clone());
    }
    return response;
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "WAWIS_CACHE_LOADED_ASSETS") return;
  const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
  event.waitUntil((async () => {
    const cache = await caches.open("wawis-app-shell-v10.32");
    const safeUrls = urls.filter((value) => {
      try {
        return new URL(value, self.location.origin).origin === self.location.origin;
      } catch {
        return false;
      }
    });
    await Promise.allSettled(safeUrls.map((url) => cache.add(url)));
  })());
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (_error) {
    payload = { title: "Nowy montaż", body: event.data?.text?.() || "Masz nowe przypisanie." };
  }

  const title = payload.title || "Nowy montaż";
  const options = {
    body: payload.body || "Masz nowe przypisanie w aplikacji.",
    icon: "/logo.png",
    badge: "/logo.png",
    tag: payload.tag || `job-${payload.jobId || "assignment"}`,
    data: {
      url: payload.url || "/",
      jobId: payload.jobId || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || "/";

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existingClient = allClients.find((client) => "focus" in client);

    if (existingClient) {
      await existingClient.focus();
      if ("navigate" in existingClient) {
        await existingClient.navigate(targetUrl);
      }
      return;
    }

    if (clients.openWindow) {
      await clients.openWindow(targetUrl);
    }
  })());
});
