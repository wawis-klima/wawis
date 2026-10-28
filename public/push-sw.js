importScripts("/push-safety.js");
importScripts("/push-context-guard.js");

// WAWIS 13.76: pełne pobranie wersji przed aktywacją.
// Dotąd telefon zapisywał ekrany (osobne pliki JS) dopiero przy pierwszym otwarciu z internetem, a stary cache
// był kasowany od razu po aktualizacji — bez zasięgu nowy ekran (np. „Tabliczki”) mógł się nie otworzyć.
// Teraz instalacja pobiera wszystkie pliki z /precache-manifest.json; gdy brakuje któregoś pliku krytycznego,
// instalacja się nie udaje i telefon zostaje przy poprzedniej, kompletnej wersji (spróbuje ponownie później).
const APP_SHELL_CACHE = "wawis-app-shell-v13.89";
const APP_SHELL_PREFIX = "wawis-app-shell-";
const PRECACHE_MANIFEST_URL = "/precache-manifest.json";
const PRECACHE_CONCURRENCY = 4;
const PRECACHE_ATTEMPTS = 3;
const BASE_SHELL_FILES = ["/", "/manifest.webmanifest", "/logo.png", "/push-safety.js", "/push-context-guard.js"];

async function fetchForPrecache(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= PRECACHE_ATTEMPTS; attempt += 1) {
    try {
      // cache: "reload" — z serwera, nie z pamięci przeglądarki (inaczej mógłby trafić plik poprzedniej wersji).
      const response = await fetch(new Request(url, { cache: "reload", credentials: "same-origin" }));
      if (response.ok && response.type === "basic" && !response.redirected) return response;
      lastError = new Error(`HTTP ${response.status} ${url}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < PRECACHE_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
  }
  throw lastError || new Error(`Nie pobrano ${url}`);
}

async function precacheUrls(cache, urls, { critical }) {
  const queue = [...new Set(urls)];
  const failed = [];
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      try {
        const response = await fetchForPrecache(url);
        await cache.put(url, response);
      } catch (error) {
        failed.push(url);
      }
    }
  }
  await Promise.all(Array.from({ length: PRECACHE_CONCURRENCY }, worker));
  if (critical && failed.length) {
    throw new Error(`Nie pobrano ${failed.length} plików aplikacji: ${failed.slice(0, 3).join(", ")}`);
  }
  return failed;
}

async function readPrecacheManifest() {
  try {
    const response = await fetch(new Request(PRECACHE_MANIFEST_URL, { cache: "no-store", credentials: "same-origin" }));
    if (!response.ok) return null;
    const manifest = await response.json();
    if (!Array.isArray(manifest?.critical) || !manifest.critical.includes("/")) return null;
    return manifest;
  } catch {
    return null;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE);
    const manifest = await readPrecacheManifest();
    if (manifest) {
      // Pliki krytyczne (strona startowa, skrypty, style): wszystkie albo instalacja się nie udaje.
      await precacheUrls(cache, [...BASE_SHELL_FILES.slice(0, 1), ...manifest.critical], { critical: true });
      // Obrazy i ikony: najlepsza próba — brak ikony nie blokuje aktualizacji.
      await precacheUrls(cache, [...BASE_SHELL_FILES.slice(1), ...(manifest.optional || [])], { critical: false });
    } else {
      // Brak listy (np. tryb deweloperski): jak przed 13.76 — podstawowe pliki, reszta przy pierwszym użyciu.
      await precacheUrls(cache, BASE_SHELL_FILES, { critical: false });
    }
    await self.skipWaiting();
  })());
});

function shellVersion(key) {
  const match = /^wawis-app-shell-v(\d+)\.(\d+)$/.exec(key);
  return match ? (Number(match[1]) * 1000) + Number(match[2]) : -1;
}

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Zostawiamy bieżącą i JEDNĄ poprzednią wersję: otwarta jeszcze karta starej wersji (albo powrót do niej)
    // nadal znajdzie swoje pliki bez internetu. Starsze wersje usuwamy. Cache czytników tabliczek bez zmian.
    const previous = keys
      .filter((key) => key.startsWith("wawis-app-shell-") && key !== APP_SHELL_CACHE)
      .sort((left, right) => shellVersion(right) - shellVersion(left));
    const keep = new Set([APP_SHELL_CACHE, ...previous.slice(0, 1)]);
    await Promise.all(keys
      .filter((key) => key.startsWith(APP_SHELL_PREFIX) && !keep.has(key))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

// WAWIS 13.70: czytniki tabliczek (OCR /ocr/* i czytnik kodów Code 128 z jsDelivr) zapisywane
// w osobnym, trwałym cache — nie jest czyszczony przy aktualizacji wersji aplikacji, dzięki czemu
// odczyt numeru SN działa także bez internetu (po pierwszym uruchomieniu z internetem).
const NAMEPLATE_READER_CACHE = "wawis-nameplate-readers-v1";
const NAMEPLATE_READER_CDN_HOSTS = ["fastly.jsdelivr.net", "cdn.jsdelivr.net"];

function isNameplateReaderAsset(url) {
  if (url.origin === self.location.origin) return url.pathname.startsWith("/ocr/");
  return NAMEPLATE_READER_CDN_HOSTS.includes(url.hostname)
    && (url.pathname.startsWith("/npm/barcode-detector@") || url.pathname.startsWith("/npm/zxing-wasm@"));
}

async function respondWithNameplateReaderAsset(request) {
  const cache = await caches.open(NAMEPLATE_READER_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && (response.type === "basic" || response.type === "cors")) {
    await cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!request.headers.has("range") && isNameplateReaderAsset(url)) {
    event.respondWith(respondWithNameplateReaderAsset(request));
    return;
  }
  if (url.origin !== self.location.origin || request.headers.has("range")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(APP_SHELL_CACHE);
          await cache.put("/", response.clone());
        }
        return response;
      } catch {
        // Najpierw strona startowa bieżącej wersji, potem poprzedniej (gdy bieżąca nie zdążyła jej zapisać).
        return (await caches.match("/", { cacheName: APP_SHELL_CACHE, ignoreVary: true })) || (await caches.match("/", { ignoreVary: true })) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    // ignoreVary: plik zapisany przy instalacji (zapytanie bez nagłówka Origin) musi pasować także do zapytania
    // skryptu modułu (z nagłówkiem Origin), gdy serwer odpowiada „Vary: Origin” — inaczej bez sieci start
    // aplikacji kończył się „Nie udało się pobrać modułu aplikacji” (E2E 13.76: 2 na 6 prób).
    const cached = await caches.match(request, { ignoreVary: true });
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && ["script", "style", "image", "font", "worker"].includes(request.destination)) {
      const cache = await caches.open(APP_SHELL_CACHE);
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
    const cache = await caches.open(APP_SHELL_CACHE);
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

function getDeliveryReceipt(payload = {}) {
  const receipt = payload?.deliveryReceipt;
  const deliveryLogId = String(receipt?.deliveryLogId || "").trim();
  const receiptToken = String(receipt?.receiptToken || "").trim();
  const endpoint = String(receipt?.endpoint || "").trim();
  if (!deliveryLogId || !receiptToken || !endpoint) return null;

  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")) return null;
    if (!url.pathname.endsWith("/functions/v1/push-delivery-receipt")) return null;
    return { deliveryLogId, receiptToken, endpoint: url.toString() };
  } catch {
    return null;
  }
}

async function reportPushReceipt(payload, stage) {
  const receipt = getDeliveryReceipt(payload);
  if (!receipt || (stage !== "received" && stage !== "displayed")) return false;

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 2500) : null;
  try {
    const response = await fetch(receipt.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deliveryLogId: receipt.deliveryLogId,
        receiptToken: receipt.receiptToken,
        stage,
      }),
      cache: "no-store",
      credentials: "omit",
      signal: controller?.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_error) {
    payload = {};
  }

  event.waitUntil((async () => {
    const receivedReceipt = reportPushReceipt(payload, "received");
    const context = await readPushContext().catch(() => null);
    if (!self.WawisPushSafety?.shouldDisplayPush(payload, context || {})) {
      await receivedReceipt.catch(() => false);
      return;
    }

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
    await Promise.allSettled([
      receivedReceipt,
      reportPushReceipt(payload, "displayed"),
    ]);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || "/";

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existingClient = allClients.find((client) => "focus" in client);

    if (existingClient) {
      const targetJobId = String(event.notification?.data?.jobId || "").trim();

      if (targetJobId && "postMessage" in existingClient) {
        existingClient.postMessage({
          type: "WAWIS_OPEN_JOB",
          jobId: targetJobId,
          url: targetUrl,
        });
      }

      if ("navigate" in existingClient) {
        try {
          await existingClient.navigate(targetUrl);
        } catch (_error) {
          // iOS/PWA potrafi odrzucić navigate() po wznowieniu; postMessage powyżej
          // otwiera montaż bez przeładowania, a URL pozostaje fallbackiem.
        }
      }

      await existingClient.focus();
      return;
    }

    if (clients.openWindow) {
      await clients.openWindow(targetUrl);
    }
  })());
});
