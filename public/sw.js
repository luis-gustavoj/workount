// Ticket 019 — app-shell service worker.
//
// The trap this file exists to avoid: never cache anything from Supabase, and
// never cache API/data responses, only the shell (HTML navigations + static
// assets). A stale-cached auth token or stale program list is a much worse
// bug than the app failing to load offline.
const SHELL_CACHE = "workount-shell-v1";
const RUNTIME_CACHE = "workount-runtime-v1";
const CURRENT_CACHES = [SHELL_CACHE, RUNTIME_CACHE];

// The two routes the ticket names by name: "/home" and "/session" must load with
// no network. Precached into RUNTIME_CACHE (the same cache navigations read
// from) so a cold, offline launch works even before either route has ever
// been visited — not just after the fact, once the runtime cache warms up.
const APP_SHELL_URLS = ["/home", "/session"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(RUNTIME_CACHE).then((cache) =>
      Promise.all(
        APP_SHELL_URLS.map((url) =>
          fetch(url, { credentials: "same-origin" })
            .then((response) => {
              // Skip redirects (e.g. signed-out -> /sign-in) so the shell
              // cache never ends up with the wrong page under a URL's key.
              if (response.ok && !response.redirected) {
                return cache.put(url, response);
              }
            })
            .catch(() => {
              // Best-effort: installing offline, or before sign-in, just
              // means no precache yet — the runtime cache still fills in
              // normally on the next successful visit to each route.
            }),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !CURRENT_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico"
  );
}

// Next build output is content-hashed and immutable — safe to serve
// cache-first, filling the cache the first time each asset is requested.
async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

// HTML navigations: always prefer the network (so an edited program never
// shows stale on reload) and only fall back to the last-seen shell when the
// network is unreachable — a cold, offline launch from the home screen.
async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Server Actions and other mutations are POSTs — never intercept them.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cross-origin covers the Supabase REST/Auth calls. Not calling
  // respondWith() here means the browser handles the request exactly as if
  // this service worker didn't exist.
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  }
});
