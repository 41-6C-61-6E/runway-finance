const CACHE_NAME = "personal-finance-26.06.1782744359865";
const STATIC_ASSETS = [
  "/",
  "/offline",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(STATIC_ASSETS);
    })(),
  );
  self.skipWaiting();
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

  // Bypass API requests
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Only handle GET requests for caching
  if (request.method !== "GET") {
    return;
  }

  // Cache static assets and config files
  if (
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/sw.js"
  ) {
    event.respondWith(cacheFirst(request));
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
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: data.icon || "/icons/icon-192x192.png",
      badge: data.badge || "/icons/icon-96x96.png",
      vibrate: data.vibrate || [100, 50, 100],
      data: {
        id: data.id,
        url: data.url || "/"
      }
    };
    event.waitUntil(
      self.registration.showNotification(data.title || "Personal Finance", options)
    );
  } catch (err) {
    console.error("Error displaying push notification:", err);
  }
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
    // If there is an existing client matching this origin/URL, focus it
    for (let i = 0; i < windowClients.length; i++) {
      const client = windowClients[i];
      if (client.url === urlToOpen && "focus" in client) {
        return client.focus();
      }
    }
    // If not, open a new window
    if (clients.openWindow) {
      return clients.openWindow(urlToOpen);
    }
  });
  promises.push(navigatePromise);

  event.waitUntil(Promise.all(promises));
});

