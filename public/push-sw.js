importScripts("/push-safety.js");
importScripts("/push-context-guard.js");

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open("wawis-app-shell-v11.41");
    await Promise.allSettled([
      cache.add("/"),
      cache.add("/manifest.webmanifest"),
      cache.add("/logo.png"),
      cache.add("/push-safety.js"),
      cache.add("/push-context-guard.js"),
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith("wawis-app-shell-") && key !== "wawis-app-shell-v11.41")
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
          const cache = await caches.open("wawis-app-shell-v11.41");
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
      const cache = await caches.open("wawis-app-shell-v11.41");
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

async function writePushContextCommand(command) {
  const db = await openPushContextDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PUSH_CONTEXT_STORE, "readwrite");
      const store = tx.objectStore(PUSH_CONTEXT_STORE);
      const readRequest = store.get("active");
      let applied = false;
      let nextValue = null;
      readRequest.onsuccess = () => {
        const current = readRequest.result || { userId: "", generation: 0, revision: 0, protocolVersion: 1 };
        if (command?.type === "WAWIS_PUSH_CONTEXT_SET") {
          const incoming = {
            endpoint: String(command.endpoint || ""),
            contextEpoch: Number(command.contextEpoch || 0),
            userId: String(command.userId || ""),
            generation: Number(command.generation || 0),
            revision: Number(command.revision || 0),
            protocolVersion: Number(command.protocolVersion || 1),
          };
          if (self.WawisPushContextGuard?.shouldApplySet(current, incoming)) {
            nextValue = { ...incoming, terminalClear: false, clearedUserId: "" };
            store.put(nextValue, "active");
            applied = true;
          } else nextValue = current;
        } else if (command?.type === "WAWIS_PUSH_CONTEXT_CLEAR") {
          const incoming = {
            expectedEndpoint: String(command.expectedEndpoint || ""),
            expectedContextEpoch: Number(command.expectedContextEpoch || 0),
            expectedUserId: String(command.expectedUserId || ""),
            expectedGeneration: Number(command.expectedGeneration || 0),
            revision: Number(command.revision || 0),
            protocolVersion: Number(command.protocolVersion || 1),
            terminal: command.terminal !== false,
          };
          if (self.WawisPushContextGuard?.shouldApplyClear(current, incoming)) {
            nextValue = {
              endpoint: current.endpoint,
              contextEpoch: current.contextEpoch,
              userId: "",
              generation: Number(current.generation || 0),
              revision: Math.max(Number(current.revision || 0), Number(incoming.revision || 0)),
              protocolVersion: Math.max(2, Number(incoming.protocolVersion || 1)),
              terminalClear: incoming.terminal !== false,
              clearedUserId: String(current.userId || ""),
            };
            store.put(nextValue, "active");
            applied = true;
          } else nextValue = current;
        }
      };
      readRequest.onerror = () => reject(readRequest.error);
      tx.oncomplete = () => resolve({ applied, context: nextValue });
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
  if (event.data?.type === "WAWIS_PUSH_CONTEXT_GET") {
    event.waitUntil((async () => {
      try {
        const context = await readPushContext();
        event.ports?.[0]?.postMessage({ ok: true, applied: true, context });
      } catch (error) {
        event.ports?.[0]?.postMessage({ ok: false, error: error?.message || String(error) });
      }
    })());
    return;
  }
  if (event.data?.type === "WAWIS_PUSH_CONTEXT_SET" || event.data?.type === "WAWIS_PUSH_CONTEXT_CLEAR") {
    event.waitUntil((async () => {
      try {
        const result = await writePushContextCommand(event.data);
        event.ports?.[0]?.postMessage({ ok: true, applied: Boolean(result?.applied), context: result?.context || null });
      } catch (error) {
        event.ports?.[0]?.postMessage({ ok: false, error: error?.message || String(error) });
      }
    })());
    return;
  }
  if (event.data?.type !== "WAWIS_CACHE_LOADED_ASSETS") return;
  const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
  event.waitUntil((async () => {
    const cache = await caches.open("wawis-app-shell-v11.41");
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
