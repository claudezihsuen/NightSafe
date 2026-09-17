const CACHE = "nightsafe-shell-v4";
const SHELL = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/brand/nightsafe-lockup.svg",
  "/icons/nightsafe-ios.svg",
  "/icons/nightsafe-android.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("nightsafe-shell-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/";
  const requested = new URL(href, self.location.origin);
  const targetUrl = requested.origin === self.location.origin ? requested.href : self.location.origin;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        if (client.url === targetUrl && "focus" in client) return client.focus();
      }
      for (const client of windows) {
        if ("navigate" in client && "focus" in client) {
          const navigated = await client.navigate(targetUrl);
          return navigated?.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
    }),
  );
});

function isPrivateRequest(request) {
  const url = new URL(request.url);
  return (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("/documents/") ||
    url.pathname.includes("/receipt") ||
    request.headers.has("Authorization")
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || isPrivateRequest(request)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match("/offline.html")) || new Response("Offline", { status: 503 })),
    );
    return;
  }

  const staticDestinations = new Set(["style", "script", "image", "font", "manifest"]);
  if (!staticDestinations.has(request.destination)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
