importScripts("/push-safety.js");

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open("wawis-app-shell-v10.78");
    await Promise.allSettled([
      cache.add("/"),
      cache.add("/manifest.webmanifest"),
      cache.add("/logo.png"),
      cache.add("/push-safety.js"),
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith("wawis-app-shell-") && key !== "wawis-app-shell-v10.78")
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
          const cache = await caches.open("wawis-app-shell-v10.78");
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
      const cache = await caches.open("wawis-app-shell-v10.78");
      await cache.put(request, response.clone());
    }
    return response;
  })());
});

const PUSH_CONTEXT_DB = "wawis-push-context-v1078";
const PUSH_CONTEXT_STORE = "context";

function openPushContextDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PUSH_CONTEXT_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PUSH_CONTEXT_STORE)) {
        request.result.createObjectStore(PUSH_CONTEXT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writePushContext(value) {
  const db = await openPushContextDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PUSH_CONTEXT_STORE, "readwrite");
      tx.objectStore(PUSH_CONTEXT_STORE).put(value, "active");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("push context transaction aborted"));
    });
  } finally { db.close(); }
}

async function readPushContext() {
  const db = await openPushContextDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PUSH_CONTEXT_STORE, "readonly");
      const request = tx.objectStore(PUSH_CONTEXT_STORE).get("active");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "WAWIS_PUSH_CONTEXT_SET") {
    event.waitUntil(writePushContext({
      userId: String(event.data.userId || ""),
      generation: Number(event.data.generation || 0),
    }));
    return;
  }
  if (event.data?.type === "WAWIS_PUSH_CONTEXT_CLEAR") {
    event.waitUntil(writePushContext({ userId: "", generation: 0 }));
    return;
  }
  if (event.data?.type !== "WAWIS_CACHE_LOADED_ASSETS") return;
  const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
  event.waitUntil((async () => {
    const cache = await caches.open("wawis-app-shell-v10.78");
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
    payload = {};
  }

  event.waitUntil((async () => {
    const context = await readPushContext().catch(() => null);
    if (!self.WawisPushSafety?.shouldDisplayPush(payload, context || {})) return;

    const title = payload.title || "Wawis";
    const options = {
      body: payload.body || "Masz nowe zdarzenie w aplikacji Wawis.",
      icon: "/logo.png",
      badge: "/logo.png",
      tag: payload.tag || `job-${payload.jobId || "event"}`,
      data: {
        url: payload.url || "/",
        jobId: payload.jobId || null,
      },
    };
    await self.registration.showNotification(title, options);
  })());
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
