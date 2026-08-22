const CACHE_NAME = "personal-finance-26.08.1787359059816";
const STATIC_ASSETS = [
  "/",
  "/offline",
  "/favicon.svg",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(STATIC_ASSETS);
    })(),
  );
  // Do NOT call self.skipWaiting() automatically to avoid breaking running clients
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        }),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests for caching
  if (request.method !== "GET") {
    return;
  }

  // Offline support for session: Network-first with cache fallback for NextAuth session
  if (url.pathname === "/api/auth/session") {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // Bypass other API requests (data queries are persisted in IndexedDB)
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Cache static assets and config files
  if (
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/sw.js" ||
    url.pathname === "/favicon.svg"
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Handle Next.js RSC Flight requests (network-first so fresh data is served when online)
  const isRSC =
    url.searchParams.has("_rsc") ||
    request.headers.get("RSC") === "1" ||
    request.headers.get("Accept")?.includes("text/x-component");

  if (isRSC) {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // Handle HTML document requests with network-first and fallback
  if (request.headers.get("Accept")?.includes("text/html")) {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirstWithFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offlinePage = await caches.match("/offline");
    if (offlinePage) return offlinePage;
    return new Response("Offline", { status: 503 });
  }
}

// ── Web Push Event Listeners ──────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    let data = {};
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() || "New notification from Personal Finance" };
    }

    const options = {
      body: data.body,
      icon: data.icon || "/icons/icon-192x192.png",
      badge: data.badge || "/icons/icon-96x96.png",
      tag: data.tag || data.type || "finance-alert",
      vibrate: data.vibrate || [100, 50, 100],
      data: {
        id: data.id,
        url: data.url || "/"
      }
    };

      // Notify all open clients so the in-app dropdown badge refreshes
      // immediately instead of waiting for the 30s poll (R11).
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: "NOTIFICATION_ARRIVED" });
          });
        })
        .catch(() => {});

    event.waitUntil(
      self.registration.showNotification(data.title || "Personal Finance", options)
    );
  } catch (err) {
    console.error("Error displaying push notification:", err);
  }
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const sub = await self.registration.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/notifications/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscription: sub.toJSON(),
              userAgent: self.navigator.userAgent,
            }),
          });
        }
      } catch (err) {
        console.error("Failed to re-sync push subscription on change:", err);
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const notificationId = event.notification.data?.id;
  const urlToOpen = new URL(event.notification.data?.url || "/", self.location.origin).href;

  const promises = [];

  // Report read state back to the app server
  if (notificationId) {
    promises.push(
      fetch(`/api/notifications/${notificationId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      }).catch(err => console.error("Error updating read status in service worker:", err))
    );
  }

  // Open or focus window
  const navigatePromise = clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
    for (let i = 0; i < windowClients.length; i++) {
      const client = windowClients[i];
      if (client.url === urlToOpen && "focus" in client) {
        return client.focus();
      }
    }
    if (clients.openWindow) {
      return clients.openWindow(urlToOpen);
    }
  });
  promises.push(navigatePromise);

  event.waitUntil(Promise.all(promises));
});


